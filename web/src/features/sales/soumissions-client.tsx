"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Printer, Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuoteStatus } from "@/types/domain";

const STATUS_INFO: Record<QuoteStatus, { label: string; color: string }> = {
  draft: { label: "Brouillon", color: "bg-secondary text-secondary-foreground" },
  pending: { label: "Va nous rappeler", color: "bg-yellow-100 text-yellow-800" },
  accepted: { label: "Acceptée", color: "bg-green-100 text-green-800" },
  refused: { label: "Refusée", color: "bg-red-100 text-red-800" },
};

export type SoumissionRow = {
  id: string;
  quote_number: number;
  client_name: string;
  client_email: string | null;
  quote_date: string;
  status: string;
  subtotal: number;
  job_id: string | null;
  appointment_id: string | null;
  salesperson_name: string | null;
  scheduled_date: string | null;
};

export const SOUMISSIONS_PAGE_SIZE = 50;

function quoteHref(q: SoumissionRow): string | null {
  if (q.appointment_id) return `/ventes/rdv/${q.appointment_id}`;
  if (q.job_id) return `/ventes/soumission/${q.job_id}`;
  return null;
}

function buildHref(page: number, q: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (q.trim()) params.set("q", q.trim());
  const qs = params.toString();
  return qs ? `/ventes/soumissions?${qs}` : "/ventes/soumissions";
}

export function SoumissionsClient({
  quotes,
  totalCount,
  page,
  pageSize,
  initialQuery,
}: {
  quotes: SoumissionRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  initialQuery: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => {
      router.push(buildHref(1, query));
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Soumissions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totalCount === 0
              ? "Aucune soumission"
              : `${from}–${to} sur ${totalCount}`}
            {initialQuery.trim() ? ` — filtre « ${initialQuery.trim()} »` : ""}
          </p>
        </div>
        <form onSubmit={submitSearch} className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="N° soumission ou courriel…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
      </div>

      {totalCount === 0 && !initialQuery.trim() && (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Aucune soumission pour le moment.{" "}
          <Link href="/ventes/pipeline" className="underline">
            Aller au pipeline
          </Link>{" "}
          pour créer une fiche.
        </div>
      )}

      {totalCount === 0 && initialQuery.trim() && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
          Aucun résultat pour « {initialQuery.trim()} ».
        </div>
      )}

      {quotes.length > 0 && (
        <div className={cn("bg-background rounded-xl border overflow-hidden", pending && "opacity-60")}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b text-xs font-semibold text-muted-foreground">
                <th className="px-4 py-3 text-left">N°</th>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Vendeur</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Date RDV</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">Sous-total</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3 text-center">Job</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const status = (q.status as QuoteStatus) ?? "draft";
                const si = STATUS_INFO[status] ?? STATUS_INFO.draft;
                const href = quoteHref(q);
                const printHref = href ? `${href}?print=1` : null;
                return (
                  <tr key={q.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono font-semibold text-primary">
                      #{q.quote_number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{q.client_name}</div>
                      {q.client_email && (
                        <div className="text-xs text-muted-foreground">{q.client_email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                      {q.salesperson_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                      {q.scheduled_date
                        ? format(parseISO(q.scheduled_date), "d MMM yyyy", { locale: fr })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell font-medium">
                      {q.subtotal > 0 ? `${Number(q.subtotal).toFixed(2)} $` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${si.color}`}>
                        {si.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {q.job_id ? (
                        <span className="text-green-600 text-xs font-medium">✓</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {href ? (
                          <Link
                            href={href}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}
                          >
                            Voir soumission
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {printHref ? (
                          <Link
                            href={printHref}
                            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-8 gap-1.5")}
                          >
                            <Printer className="size-3.5" />
                            Imprimer
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            Page {page} / {totalPages}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={buildHref(page - 1, initialQuery)}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1")}
              >
                <ChevronLeft className="size-3.5" />
                Précédent
              </Link>
            ) : (
              <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1 opacity-40 pointer-events-none")}>
                <ChevronLeft className="size-3.5" />
                Précédent
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={buildHref(page + 1, initialQuery)}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1")}
              >
                Suivant
                <ChevronRight className="size-3.5" />
              </Link>
            ) : (
              <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1 opacity-40 pointer-events-none")}>
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
