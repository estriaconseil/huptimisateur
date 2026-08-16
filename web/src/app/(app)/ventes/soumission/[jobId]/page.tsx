import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { QuoteForm, ScrollToQuoteActionsButton } from "@/features/sales/quote-form";
import { AutoPrint } from "@/features/sales/auto-print";
import { getNextQuoteNumber } from "@/actions/sales";
import { quoteBackLink } from "@/lib/quote-back";
import type { Quote, QuoteUnit, Salesperson } from "@/types/domain";

type Props = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ print?: string; from?: string; week?: string }>;
};

const INSTALL_STATUSES = ["a_planifier", "reparti", "retour_a_faire", "facturation", "complete", "termine"];

export default async function JobQuotePage({ params, searchParams }: Props) {
  const { jobId } = await params;
  const { print, from, week } = await searchParams;
  const autoPrint = print === "1";
  const supabase = await createServerSupabaseClient();

  const { data: job } = await supabase
    .from("jobs")
    .select(
      `id, status, appointment_id, salesperson_id, installation_info, installation_address_id,
       clients ( id, name, phone, email, billing_address ),
       installation_addresses!installation_address_id(address_formatted, city)`
    )
    .eq("id", jobId)
    .maybeSingle();

  if (!job) notFound();

  // Si un RDV est lié, rediriger vers la page RDV (source de vérité calendrier)
  if (job.appointment_id) {
    const qs = new URLSearchParams();
    if (autoPrint) qs.set("print", "1");
    if (from) qs.set("from", from);
    if (week) qs.set("week", week);
    const suffix = qs.size ? `?${qs.toString()}` : "";
    redirect(`/ventes/rdv/${job.appointment_id}${suffix}`);
  }

  const clientRaw = job.clients;
  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    billing_address: string | null;
  } | null;

  const installRaw = (job as unknown as { installation_addresses: unknown }).installation_addresses;
  const jobInstall = (Array.isArray(installRaw) ? installRaw[0] : installRaw) as {
    address_formatted: string | null;
    city: string | null;
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
  const back = quoteBackLink({ from, week, alreadyConverted });

  return (
    <div className="max-w-4xl mx-auto">
      <AutoPrint enabled={autoPrint} />
      <Link
        href={back.href}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 print:hidden"
      >
        <ArrowLeft className="size-4" />
        {back.label}
      </Link>

      <div className="mb-6 print:hidden flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {quote ? `Soumission #${quote.quote_number}` : "Créer soumission"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{client?.name ?? "Client"}</p>
        </div>
        <ScrollToQuoteActionsButton />
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
        installAddress={jobInstall?.address_formatted ?? null}
        defaultClient={
          quote
            ? undefined
            : {
                name: client?.name ?? "",
                phone: client?.phone ?? null,
                email: client?.email ?? null,
                address: client?.billing_address ?? null,
                install_address: jobInstall?.address_formatted ?? null,
                salesperson_id: job.salesperson_id,
              }
        }
      />
    </div>
  );
}
