import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";
import { PipelineClient, type PipelineJob } from "@/features/sales/pipeline-client";
import type { JobStatus, Salesperson } from "@/types/domain";

const PIPELINE_STATUSES: JobStatus[] = [
  "soumission_en_attente",
  "soumission_repartie",
  "en_attente",
];

export default async function VentesPipelinePage() {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: rawJobs }, { data: spData }, { data: profile }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        `id, status, follow_up_flag, appointment_id, salesperson_id, installation_info, internal_notes, follow_up_date, created_at,
         clients ( id, name, phone, email, city, address_formatted, lat, lng ),
         salespeople ( name )`
      )
      .in("status", PIPELINE_STATUSES)
      .order("follow_up_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),

    supabase
      .from("salespeople")
      .select("id, name, active, profile_id, home_address, home_lat, home_lng, notes, created_at")
      .eq("active", true)
      .order("name"),

    user
      ? supabase
          .from("salespeople")
          .select("id")
          .eq("profile_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  type RawRow = {
    id: string;
    status: string;
    follow_up_flag: string | null;
    appointment_id: string | null;
    salesperson_id: string | null;
    installation_info: string | null;
    internal_notes: string | null;
    follow_up_date: string | null;
    created_at: string;
    clients: unknown;
    salespeople: unknown;
  };

  const jobIds = (rawJobs ?? []).map((r) => (r as RawRow).id);
  const apptIds = (rawJobs ?? [])
    .map((r) => (r as RawRow).appointment_id)
    .filter((id): id is string => !!id);

  // Dates RDV pour badge « RDV passé »
  const apptDateById = new Map<string, string>();
  if (apptIds.length > 0) {
    const { data: appts } = await supabase
      .from("sales_appointments")
      .select("id, scheduled_date")
      .in("id", apptIds);
    for (const a of appts ?? []) {
      const row = a as { id: string; scheduled_date: string };
      apptDateById.set(row.id, row.scheduled_date);
    }
  }

  // Auto-drapeau « RDV passé » (une seule fois : si follow_up_flag encore null)
  const todayStr = new Date().toISOString().slice(0, 10);
  const rdvPasseIds = ((rawJobs ?? []) as RawRow[])
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

    for (const r of (rawJobs ?? []) as RawRow[]) {
      if (rdvPasseIds.includes(r.id)) r.follow_up_flag = "rdv_passe";
    }
  }

  // Soumissions liées (par job_id ou appointment_id)
  const quoteJobIds = new Set<string>();
  if (jobIds.length > 0 || apptIds.length > 0) {
    let q = supabase.from("quotes").select("job_id, appointment_id");
    if (jobIds.length > 0 && apptIds.length > 0) {
      q = q.or(`job_id.in.(${jobIds.join(",")}),appointment_id.in.(${apptIds.join(",")})`);
    } else if (jobIds.length > 0) {
      q = q.in("job_id", jobIds);
    } else {
      q = q.in("appointment_id", apptIds);
    }
    const { data: quotes } = await q;
    for (const row of quotes ?? []) {
      const qr = row as { job_id: string | null; appointment_id: string | null };
      if (qr.job_id) quoteJobIds.add(qr.job_id);
    }
    // Map appointment → job for quotes that only have appointment_id
    if (quotes?.length) {
      const apptWithQuote = new Set(
        (quotes as { appointment_id: string | null }[])
          .map((x) => x.appointment_id)
          .filter((id): id is string => !!id)
      );
      for (const r of (rawJobs ?? []) as RawRow[]) {
        if (r.appointment_id && apptWithQuote.has(r.appointment_id)) {
          quoteJobIds.add(r.id);
        }
      }
    }
  }

  const jobs: PipelineJob[] = (rawJobs ?? []).map((r: unknown) => {
    const row = r as RawRow;
    return {
      id: row.id,
      status: row.status as JobStatus,
      follow_up_flag: (row.follow_up_flag ?? null) as PipelineJob["follow_up_flag"],
      appointment_id: row.appointment_id ?? null,
      appointment_date: row.appointment_id
        ? (apptDateById.get(row.appointment_id) ?? null)
        : null,
      has_quote: quoteJobIds.has(row.id),
      salesperson_id: row.salesperson_id,
      installation_info: row.installation_info,
      internal_notes: row.internal_notes,
      follow_up_date: row.follow_up_date,
      created_at: row.created_at,
      clients: unwrapRelation<NonNullable<PipelineJob["clients"]>>(row.clients),
      salespeople: unwrapRelation<{ name: string }>(row.salespeople),
    };
  });

  const salespeople = (spData ?? []) as Salesperson[];
  const currentSalespersonId = (profile as { id: string } | null)?.id ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <PipelineClient
        jobs={jobs}
        salespeople={salespeople}
        currentSalespersonId={currentSalespersonId}
      />
    </div>
  );
}
