import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Phone, MapPin } from "lucide-react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { QuoteForm } from "@/features/sales/quote-form";
import { AutoPrint } from "@/features/sales/auto-print";
import { getNextQuoteNumber } from "@/actions/sales";
import { statusLabel } from "@/lib/job-status";
import type { Quote, QuoteUnit, Salesperson } from "@/types/domain";

type Props = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ print?: string }>;
};

const INSTALL_STATUSES = ["a_planifier", "reparti", "retour_a_faire", "facturation", "complete", "termine"];

export default async function JobQuotePage({ params, searchParams }: Props) {
  const { jobId } = await params;
  const { print } = await searchParams;
  const autoPrint = print === "1";
  const supabase = await createServerSupabaseClient();

  const { data: job } = await supabase
    .from("jobs")
    .select(
      `id, status, appointment_id, salesperson_id, installation_info,
       clients ( id, name, phone, email, address_formatted )`
    )
    .eq("id", jobId)
    .maybeSingle();

  if (!job) notFound();

  // Si un RDV est lié, rediriger vers la page RDV (source de vérité calendrier)
  if (job.appointment_id) {
    redirect(`/ventes/rdv/${job.appointment_id}${autoPrint ? "?print=1" : ""}`);
  }

  const clientRaw = job.clients;
  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address_formatted: string | null;
  } | null;

  // Soumission existante liée à ce job
  const { data: q } = await supabase
    .from("quotes")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const quote = (q as Quote | null) ?? null;
  let units: QuoteUnit[] = [];
  if (quote) {
    const { data: u } = await supabase
      .from("quote_units")
      .select("*")
      .eq("quote_id", quote.id)
      .order("unit_order");
    if (u) units = u as QuoteUnit[];
  }

  const { data: spData } = await supabase
    .from("salespeople")
    .select("id, name, active, profile_id, home_address, home_lat, home_lng, notes, created_at")
    .eq("active", true)
    .order("name");

  const salespeople: Salesperson[] = (spData ?? []) as Salesperson[];
  const nextQuoteNumber = quote ? undefined : await getNextQuoteNumber();
  const alreadyConverted = INSTALL_STATUSES.includes(job.status);

  return (
    <div className="max-w-4xl mx-auto">
      <AutoPrint enabled={autoPrint} />
      <Link
        href="/ventes/pipeline"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 print:hidden"
      >
        <ArrowLeft className="size-4" />
        Retour au pipeline
      </Link>

      <div className="bg-background rounded-xl border p-5 mb-6 print:hidden">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">{client?.name ?? "Client"}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              {client?.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="size-3.5" />
                  {client.phone}
                </span>
              )}
              {client?.address_formatted && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {client.address_formatted}
                </span>
              )}
            </div>
          </div>
          <span className="rounded-full px-3 py-0.5 text-xs font-medium bg-muted">
            {statusLabel(job.status)}
          </span>
        </div>
        {job.installation_info && (
          <p className="mt-3 text-sm text-muted-foreground border-t pt-3">{job.installation_info}</p>
        )}
      </div>

      <div className="mb-3 print:hidden">
        <h2 className="text-lg font-semibold">
          {quote ? `Soumission #${quote.quote_number}` : "Créer la soumission"}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Sans rendez-vous calendrier — soumission directe (ex. directeur au téléphone)
        </p>
      </div>

      <QuoteForm
        jobId={jobId}
        appointmentId={null}
        quoteId={quote?.id}
        initialQuote={quote ?? undefined}
        initialUnits={units}
        salespeople={salespeople}
        nextQuoteNumber={nextQuoteNumber}
        alreadyConverted={alreadyConverted}
        defaultClient={
          quote
            ? undefined
            : {
                name: client?.name ?? "",
                phone: client?.phone ?? null,
                email: client?.email ?? null,
                address: client?.address_formatted ?? null,
                salesperson_id: job.salesperson_id,
              }
        }
      />
    </div>
  );
}
