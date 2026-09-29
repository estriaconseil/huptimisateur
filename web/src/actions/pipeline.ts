"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentSalespersonId } from "@/lib/supabase/profile";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";
import type { PipelineJob, PipelineInstallationAddress } from "@/features/sales/pipeline-client";
import type { JobStatus, FollowUpFlag } from "@/types/domain";
import {
  PIPELINE_PAGE_SIZE,
  JOB_SELECT,
  type RawPipelineRow,
} from "@/lib/pipeline-config";

/**
 * Enrichit une liste de rows brutes :
 *  - récupère les dates de RDV
 *  - auto-flag « rdv_passe » (une seule fois, si follow_up_flag encore null)
 *  - récupère les numéros de soumission liés
 */
export async function enrichPipelineRows(rawRows: RawPipelineRow[]): Promise<PipelineJob[]> {
  if (rawRows.length === 0) return [];
  const supabase = await createServerSupabaseClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const apptIds = rawRows.map((r) => r.appointment_id).filter((id): id is string => !!id);
  const jobIds = rawRows.map((r) => r.id);

  // ── Requêtes parallèles : appointments + quotes en même temps ──────────────
  const apptPromise = apptIds.length > 0
    ? supabase.from("sales_appointments").select("id, scheduled_date").in("id", apptIds)
    : Promise.resolve({ data: [] as { id: string; scheduled_date: string }[] });

  let quotesQuery = supabase.from("quotes").select("job_id, appointment_id, quote_number");
  if (jobIds.length > 0 && apptIds.length > 0) {
    quotesQuery = quotesQuery.or(`job_id.in.(${jobIds.join(",")}),appointment_id.in.(${apptIds.join(",")})`);
  } else if (jobIds.length > 0) {
    quotesQuery = quotesQuery.in("job_id", jobIds);
  } else if (apptIds.length > 0) {
    quotesQuery = quotesQuery.in("appointment_id", apptIds);
  }
  const quotesPromise = (jobIds.length > 0 || apptIds.length > 0)
    ? quotesQuery
    : Promise.resolve({ data: [] as { job_id: string | null; appointment_id: string | null; quote_number: number | null }[] });

  const [{ data: appts }, { data: quotesRaw }] = await Promise.all([apptPromise, quotesPromise]);

  // Dates RDV
  const apptDateById = new Map<string, string>();
  for (const a of appts ?? []) {
    const row = a as { id: string; scheduled_date: string };
    apptDateById.set(row.id, row.scheduled_date);
  }

  // Auto-flag rdv_passe (après avoir les dates RDV)
  const rdvPasseIds = rawRows
    .filter((r) => {
      if (r.status !== "soumission_repartie" || r.follow_up_flag) return false;
      if (!r.appointment_id) return false;
      const d = apptDateById.get(r.appointment_id);
      return !!d && d < todayStr;
    })
    .map((r) => r.id);

  if (rdvPasseIds.length > 0) {
    await supabase
      .from("jobs")
      .update({ follow_up_flag: "rdv_passe" })
      .in("id", rdvPasseIds)
      .is("follow_up_flag", null);
    for (const r of rawRows) {
      if (rdvPasseIds.includes(r.id)) r.follow_up_flag = "rdv_passe";
    }
  }

  // Soumissions liées
  const quoteJobIds = new Set<string>();
  const quoteNumberByJobId = new Map<string, number>();
  function rememberQuote(jobId: string, quoteNumber: number | null) {
    quoteJobIds.add(jobId);
    if (quoteNumber == null) return;
    const prev = quoteNumberByJobId.get(jobId) ?? 0;
    if (quoteNumber > prev) quoteNumberByJobId.set(jobId, quoteNumber);
  }

  const apptQuoteNumber = new Map<string, number>();
  for (const row of quotesRaw ?? []) {
    const qr = row as { job_id: string | null; appointment_id: string | null; quote_number: number | null };
    if (qr.job_id) rememberQuote(qr.job_id, qr.quote_number);
    if (qr.appointment_id && qr.quote_number != null) {
      const prev = apptQuoteNumber.get(qr.appointment_id) ?? 0;
      if (qr.quote_number > prev) apptQuoteNumber.set(qr.appointment_id, qr.quote_number);
    }
  }
  for (const r of rawRows) {
    if (!r.appointment_id) continue;
    const n = apptQuoteNumber.get(r.appointment_id);
    if (n != null) rememberQuote(r.id, n);
  }

  return rawRows.map((row) => ({
    id: row.id,
    status: row.status as JobStatus,
    follow_up_flag: (row.follow_up_flag ?? null) as FollowUpFlag,
    appointment_id: row.appointment_id ?? null,
    appointment_date: row.appointment_id
      ? (apptDateById.get(row.appointment_id) ?? null)
      : null,
    has_quote: quoteJobIds.has(row.id),
    quote_number: quoteNumberByJobId.get(row.id) ?? null,
    salesperson_id: row.salesperson_id,
    salesperson_locked: row.salesperson_locked ?? false,
    installation_info: row.installation_info,
    internal_notes: row.internal_notes,
    follow_up_date: row.follow_up_date,
    created_at: row.created_at,
    installation_address_id: row.installation_address_id ?? null,
    installation_address:
      unwrapRelation<PipelineInstallationAddress>(row.installation_addresses) ?? null,
    clients: unwrapRelation<NonNullable<PipelineJob["clients"]>>(row.clients),
    salespeople: unwrapRelation<{ name: string }>(row.salespeople),
  }));
}

/**
 * Charge la prochaine tranche de dossiers « Va nous rappeler ».
 * Triés de la même façon que la requête initiale de la page.
 */
export async function fetchMoreEnAttente({
  offset,
}: {
  offset: number;
}): Promise<PipelineJob[]> {
  const supabase = await createServerSupabaseClient();
  const currentSalespersonId = await getCurrentSalespersonId();

  let q = supabase
    .from("jobs")
    .select(JOB_SELECT)
    .eq("status", "en_attente")
    .order("follow_up_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .range(offset, offset + PIPELINE_PAGE_SIZE - 1);

  if (currentSalespersonId) {
    q = q.eq("salesperson_id", currentSalespersonId);
  }

  const { data } = await q;

  return enrichPipelineRows((data ?? []) as unknown as RawPipelineRow[]);
}
