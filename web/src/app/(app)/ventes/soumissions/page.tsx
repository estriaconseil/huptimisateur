import Link from "next/link";
import { Suspense } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Mail, Printer } from "lucide-react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuoteStatus } from "@/types/domain";
import { SoumissionsSearch } from "@/features/sales/soumissions-client";
import {
  SOUMISSIONS_PAGE_SIZE,
  type SoumissionRow,
} from "@/features/sales/soumissions-shared";

export const dynamic = "force-dynamic";

const STATUS_INFO: Record<QuoteStatus, { label: string; color: string }> = {
  draft: { label: "Brouillon", color: "bg-secondary text-secondary-foreground" },
  pending: { label: "Va nous rappeler", color: "bg-yellow-100 text-yellow-800" },
  accepted: { label: "Acceptée", color: "bg-green-100 text-green-800" },
  refused: { label: "Refusée", color: "bg-red-100 text-red-800" },
};

function escapeIlike(value: string): string {
  return value.replace(/[%_,]/g, "\\$&");
}

function extractQuoteNumber(q: string): number | null {
  const digits = q.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function quoteHref(row: SoumissionRow): string | null {
  if (row.appointment_id) return `/ventes/rdv/${row.appointment_id}`;
  if (row.job_id) return `/ventes/soumission/${row.job_id}`;
  return null;
}

function buildHref(page: number, q: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (q.trim()) params.set("q", q.trim());
  const qs = params.toString();
  return qs ? `/ventes/soumissions?${qs}` : "/ventes/soumissions";
}

export default async function SoumissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const pageRaw = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize =
    Number.isFinite(SOUMISSIONS_PAGE_SIZE) && SOUMISSIONS_PAGE_SIZE > 0
      ? SOUMISSIONS_PAGE_SIZE
      : 10;
  const from = (page - 1) * pageSize;

  const supabase = await createServerSupabaseClient();

  // 1) Données — limit/offset (pas de count sur la même requête)
  let dataQuery = supabase
    .from("quotes")
    .select(
      "id, quote_number, client_name, client_email, quote_date, status, subtotal, job_id, appointment_id, salesperson_id, created_at"
    )
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  // 2) Compteur séparé (head) pour la pagination
  let countQuery = supabase
    .from("quotes")
    .select("id", { count: "exact", head: true });

  if (q) {
    const safe = escapeIlike(q);
    const quoteNum = extractQuoteNumber(q);
    const looksLikePureNumber = /^\s*#?\s*\d+\s*$/.test(q);

    if (looksLikePureNumber && quoteNum != null) {
      dataQuery = dataQuery.eq("quote_number", quoteNum);
      countQuery = countQuery.eq("quote_number", quoteNum);
    } else if (q.length >= 2) {
      const orFilter =
        quoteNum != null
          ? `quote_number.eq.${quoteNum},client_email.ilike.%${safe}%,client_name.ilike.%${safe}%`
          : `client_email.ilike.%${safe}%,client_name.ilike.%${safe}%`;
      dataQuery = dataQuery.or(orFilter);
      countQuery = countQuery.or(orFilter);
    }
  }

  const [dataRes, countRes] = await Promise.all([dataQuery, countQuery]);

  if (dataRes.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        Erreur chargement soumissions : {dataRes.error.message}
      </div>
    );
  }

  const rowsRaw = dataRes.data ?? [];
  const totalCount = countRes.count ?? rowsRaw.length;

  const salespersonIds = [
    ...new Set(
      rowsRaw
        .map((r) => r.salesperson_id as string | null)
        .filter((id): id is string => !!id)
    ),
  ];
  const appointmentIds = [
    ...new Set(
      rowsRaw
        .map((r) => r.appointment_id as string | null)
        .filter((id): id is string => !!id)
    ),
  ];

  const spNameById = new Map<string, string>();
  const apptDateById = new Map<string, string>();

  if (salespersonIds.length > 0) {
    const { data: sps } = await supabase
      .from("salespeople")
      .select("id, name")
      .in("id", salespersonIds);
    for (const spRow of sps ?? []) {
      spNameById.set(spRow.id as string, spRow.name as string);
    }
  }

  if (appointmentIds.length > 0) {
    const { data: appts } = await supabase
      .from("sales_appointments")
      .select("id, scheduled_date")
      .in("id", appointmentIds);
    for (const a of appts ?? []) {
      apptDateById.set(a.id as string, a.scheduled_date as string);
    }
  }

  const rows: SoumissionRow[] = rowsRaw.map((raw) => {
    const spId = (raw.salesperson_id as string | null) ?? null;
    const apptId = (raw.appointment_id as string | null) ?? null;
    return {
      id: String(raw.id),
      quote_number: Number(raw.quote_number),
      client_name: (raw.client_name as string) || "—",
      client_email: (raw.client_email as string | null) ?? null,
      quote_date: (raw.quote_date as string) ?? "",
      status: (raw.status as string) ?? "draft",
      subtotal: Number(raw.subtotal) || 0,
      job_id: (raw.job_id as string | null) ?? null,
      appointment_id: apptId,
      salesperson_name: spId ? (spNameById.get(spId) ?? null) : null,
      scheduled_date: apptId ? (apptDateById.get(apptId) ?? null) : null,
    };
  });

  const isFiltered = q.length > 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const fromLabel = totalCount === 0 ? 0 : from + 1;
  const toLabel = Math.min(from + pageSize, totalCount);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Soumissions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isFiltered
              ? totalCount === 0
                ? `Aucun résultat pour « ${q} »`
                : `${fromLabel}–${toLabel} sur ${totalCount} — filtre « ${q} »`
              : totalCount === 0
                ? "Aucune soumission"
                : `${fromLabel}–${toLabel} sur ${totalCount} — plus récentes`}
          </p>
        </div>
        <Suspense>
          <SoumissionsSearch initialQuery={q} />
        </Suspense>
      </div>

      {totalCount === 0 && !isFiltered && (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Aucune soumission pour le moment.{" "}
          <Link href="/ventes/pipeline" className="underline">
            Aller au pipeline
          </Link>{" "}
          pour créer une fiche.
        </div>
      )}

      {totalCount === 0 && isFiltered && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
          Aucun résultat pour « {q} ».
          <p className="mt-2 text-xs">
            Essayez le n° exact (ex. 60012), le nom du prospect ou le courriel.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => {
            const status = (row.status as QuoteStatus) ?? "draft";
            const si = STATUS_INFO[status] ?? STATUS_INFO.draft;
            const href = quoteHref(row);
            const printHref = href ? `${href}?print=1` : null;
            return (
              <div
                key={row.id}
                className="rounded-xl border bg-white dark:bg-card shadow-sm overflow-hidden"
              >
                <div className="flex flex-wrap items-start gap-3 px-4 py-3 bg-slate-50/60 dark:bg-muted/20 border-b border-border">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-primary">#{row.quote_number}</span>
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${si.color}`}
                      >
                        {si.label}
                      </span>
                      {row.job_id ? (
                        <span className="text-[11px] font-medium text-green-700">Job lié</span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">
                      {row.client_name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {row.client_email ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="size-3 shrink-0" />
                          {row.client_email}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/70 italic">Pas de courriel</span>
                      )}
                      {row.salesperson_name && (
                        <span className="text-xs text-muted-foreground">
                          Vendeur : {row.salesperson_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 space-y-0.5 text-right">
                    {row.subtotal > 0 && (
                      <p className="text-sm font-semibold tabular-nums">
                        {row.subtotal.toFixed(2)} $
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {row.scheduled_date
                        ? `RDV ${format(parseISO(row.scheduled_date), "d MMM yyyy", { locale: fr })}`
                        : row.quote_date
                          ? format(parseISO(row.quote_date), "d MMM yyyy", { locale: fr })
                          : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-2.5">
                  {href ? (
                    <Link
                      href={href}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}
                    >
                      Voir soumission
                    </Link>
                  ) : (
                    <span className="mr-auto text-xs text-muted-foreground">Lien indisponible</span>
                  )}
                  {printHref ? (
                    <Link
                      href={printHref}
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "h-8 gap-1.5"
                      )}
                    >
                      <Printer className="size-3.5" />
                      Imprimer
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalCount > 0 && rows.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Compteur = {totalCount}, mais 0 ligne renvoyée par Supabase
          {countRes.error ? ` (count err: ${countRes.error.message})` : ""}.{" "}
          <Link href={buildHref(1, q)} className="font-medium underline">
            Réessayer page 1
          </Link>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            Page {page} / {totalPages}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={buildHref(page - 1, q)}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1")}
              >
                <ChevronLeft className="size-3.5" />
                Précédent
              </Link>
            ) : (
              <span
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "pointer-events-none h-8 gap-1 opacity-40"
                )}
              >
                <ChevronLeft className="size-3.5" />
                Précédent
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={buildHref(page + 1, q)}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1")}
              >
                Suivant
                <ChevronRight className="size-3.5" />
              </Link>
            ) : (
              <span
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "pointer-events-none h-8 gap-1 opacity-40"
                )}
              >
                Suivant
                <ChevronRight className="size-3.5" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
