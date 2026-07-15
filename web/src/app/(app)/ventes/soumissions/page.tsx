import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Printer } from "lucide-react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuoteStatus } from "@/types/domain";

const STATUS_INFO: Record<QuoteStatus, { label: string; color: string }> = {
  draft:    { label: "Brouillon",  color: "bg-secondary text-secondary-foreground" },
  pending:  { label: "En attente", color: "bg-yellow-100 text-yellow-800" },
  accepted: { label: "Acceptée",   color: "bg-green-100 text-green-800" },
  refused:  { label: "Refusée",    color: "bg-red-100 text-red-800" },
};

function quoteHref(q: { appointment_id: string | null; job_id: string | null }): string | null {
  if (q.appointment_id) return `/ventes/rdv/${q.appointment_id}`;
  if (q.job_id) return `/ventes/soumission/${q.job_id}`;
  return null;
}

export default async function SoumissionsPage() {
  const supabase = await createServerSupabaseClient();

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select(`
      id, quote_number, client_name, client_email, quote_date, status,
      subtotal, job_id, appointment_id,
      salespeople!salesperson_id(name),
      sales_appointments!appointment_id(scheduled_date)
    `)
    .order("quote_number", { ascending: false });

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        Erreur chargement soumissions : {error.message}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Soumissions</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Toutes les soumissions, tous statuts confondus
        </p>
      </div>

      {(!quotes || quotes.length === 0) && (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Aucune soumission pour le moment.{" "}
          <Link href="/ventes/pipeline" className="underline">
            Aller au pipeline
          </Link>{" "}
          pour créer une fiche.
        </div>
      )}

      {quotes && quotes.length > 0 && (
        <div className="bg-background rounded-xl border overflow-hidden">
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
                const sp = Array.isArray(q.salespeople) ? q.salespeople[0] : q.salespeople;
                const appt = Array.isArray(q.sales_appointments) ? q.sales_appointments[0] : q.sales_appointments;
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
                      {(sp as { name?: string } | null)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                      {(appt as { scheduled_date?: string } | null)?.scheduled_date
                        ? format(parseISO((appt as { scheduled_date: string }).scheduled_date), "d MMM yyyy", { locale: fr })
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
    </div>
  );
}
