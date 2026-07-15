import { notFound } from "next/navigation";
import Link from "next/link";
import { format, parseISO, addMinutes, parse } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Phone, MapPin, CalendarDays, Clock } from "lucide-react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { QuoteForm } from "@/features/sales/quote-form";
import { AutoPrint } from "@/features/sales/auto-print";
import { getNextQuoteNumber } from "@/actions/sales";
import type { Quote, QuoteUnit, Salesperson } from "@/types/domain";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Prévu",
  completed: "Complété",
  cancelled: "Annulé",
  no_show:   "Absent",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  no_show:   "bg-orange-100 text-orange-800",
};

function formatTime(time: string): string {
  return time.slice(0, 5);
}

function formatEndTime(startTime: string, durationMin = 90): string {
  const base = new Date(2000, 0, 1);
  const start = parse(startTime.slice(0, 5), "HH:mm", base);
  return format(addMinutes(start, durationMin), "HH:mm");
}

export default async function AppointmentDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { print } = await searchParams;
  const autoPrint = print === "1";
  const supabase = await createServerSupabaseClient();

  // Charger le rendez-vous
  const { data: appt } = await supabase
    .from("sales_appointments")
    .select("*, salespeople!salesperson_id(id, name)")
    .eq("id", id)
    .maybeSingle();

  if (!appt) notFound();

  // Charger la soumission liée (si elle existe)
  let quote: Quote | null = null;
  let units: QuoteUnit[] = [];
  let linkedJobStatus: string | null = null;

  if (appt.quote_id) {
    const { data: q } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", appt.quote_id)
      .maybeSingle();
    if (q) quote = q as Quote;

    const { data: u } = await supabase
      .from("quote_units")
      .select("*")
      .eq("quote_id", appt.quote_id)
      .order("unit_order");
    if (u) units = u as QuoteUnit[];
  }

  // Job lié au RDV (pour statut conversion + jobId)
  const { data: linkedJob } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("appointment_id", id)
    .maybeSingle();

  if (linkedJob) linkedJobStatus = linkedJob.status;

  const INSTALL_STATUSES = ["a_planifier", "reparti", "retour_a_faire", "facturation", "complete", "termine"];
  const alreadyConverted = !!(linkedJobStatus && INSTALL_STATUSES.includes(linkedJobStatus));

  // Vendeurs pour le formulaire
  const { data: spData } = await supabase
    .from("salespeople")
    .select("id, name, active, profile_id, home_address, home_lat, home_lng, notes, created_at")
    .eq("active", true)
    .order("name");

  const salespeople: Salesperson[] = (spData ?? []) as Salesperson[];

  const nextQuoteNumber = quote ? undefined : await getNextQuoteNumber();

  const salesperson = Array.isArray(appt.salespeople) ? appt.salespeople[0] : appt.salespeople;
  const spId = (salesperson as { id?: string } | null)?.id ?? null;
  const spName = (salesperson as { name?: string } | null)?.name ?? "—";

  const defaultClient = {
    name: appt.client_name ?? "",
    phone: appt.client_phone ?? null,
    email: appt.client_email ?? null,
    address: appt.client_address ?? null,
    salesperson_id: spId,
  };

  const weekDate = format(parseISO(appt.scheduled_date), "yyyy-MM-dd");

  return (
    <div className="max-w-4xl mx-auto">
      <AutoPrint enabled={autoPrint} />
      {/* Retour */}
      <Link
        href={`/ventes?week=${weekDate}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 print:hidden"
      >
        <ArrowLeft className="size-4" />
        Retour au calendrier
      </Link>

      {/* Carte rendez-vous */}
      <div className="bg-background rounded-xl border p-5 mb-6 print:hidden">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">{appt.client_name}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {format(parseISO(appt.scheduled_date), "EEEE d MMMM yyyy", { locale: fr })}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />
                {formatTime(appt.start_time)} – {formatEndTime(appt.start_time)}
              </span>
              {appt.client_phone && (
                <span className="flex items-center gap-1">
                  <Phone className="size-3.5" />
                  {appt.client_phone}
                </span>
              )}
              {appt.client_address && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {appt.client_address}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] ?? "bg-muted"}`}>
              {STATUS_LABELS[appt.status] ?? appt.status}
            </span>
            <span className="text-xs text-muted-foreground">Vendeur : {spName}</span>
          </div>
        </div>

        {appt.notes && (
          <p className="mt-3 text-sm text-muted-foreground border-t pt-3">{appt.notes}</p>
        )}
      </div>

      {/* Soumission */}
      <div className="mb-3 print:hidden">
        <h2 className="text-lg font-semibold">
          {quote ? `Soumission #${quote.quote_number}` : "Créer la soumission"}
        </h2>
      </div>

      <QuoteForm
        appointmentId={id}
        jobId={linkedJob?.id ?? quote?.job_id ?? null}
        quoteId={quote?.id}
        initialQuote={quote ?? undefined}
        initialUnits={units}
        salespeople={salespeople}
        nextQuoteNumber={nextQuoteNumber}
        defaultClient={quote ? undefined : defaultClient}
        alreadyConverted={alreadyConverted}
      />
    </div>
  );
}
