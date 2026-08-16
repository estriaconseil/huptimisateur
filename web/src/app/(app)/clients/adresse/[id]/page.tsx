import { ArrowLeft, ExternalLink, FileText, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NouvellesoumissionButton, ReprendreButton } from "@/features/clients/adresse-fiche-actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { statusColor, statusLabel } from "@/lib/job-status";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

// ── Types locaux ──────────────────────────────────────────────────────────────

type JobRow = {
  id: string;
  status: string;
  estimated_duration_hours: number;
  preferred_date: string | null;
  installation_info: string | null;
  quote_number: number | null;
  quote_id: string | null;
};

type RelatedEntry = {
  installation_address_id: string;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  jobs: JobRow[];
};

// ── Helper : lien fiche selon statut ─────────────────────────────────────────
function jobFicheLink(status: string, jobId: string) {
  if (["soumission_en_attente", "soumission_repartie", "en_attente"].includes(status))
    return { href: `/ventes/pipeline?job=${jobId}`, label: "Fiche prospect" };
  if (["a_planifier", "reparti", "retour_a_faire"].includes(status))
    return { href: `/a-planifier?job=${jobId}`, label: "Fiche installation" };
  return { href: `/ventes/soumission/${jobId}`, label: "Voir la job" };
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function AdresseFichePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  // 1. Charger l'adresse d'installation principale
  const { data: addr, error: addrErr } = await supabase
    .from("installation_addresses")
    .select(
      `id, label, address_formatted, city, postal_code, lat, lng, installation_info,
       client_id,
       clients ( id, name, phone, email, billing_address, billing_city, billing_postal ),
       jobs (
         id, status, estimated_duration_hours, preferred_date, installation_info,
         quotes ( id, quote_number )
       )`
    )
    .eq("id", id)
    .maybeSingle();

  if (addrErr || !addr) notFound();

  const client = (Array.isArray(addr.clients) ? addr.clients[0] : addr.clients) as {
    id: string; name: string; phone: string | null; email: string | null;
    billing_address: string | null; billing_city: string | null; billing_postal: string | null;
  } | null;

  const rawJobs = Array.isArray(addr.jobs) ? addr.jobs : addr.jobs ? [addr.jobs] : [];
  const jobs: JobRow[] = (rawJobs as Array<{
    id: string; status: string; estimated_duration_hours: number; preferred_date: string | null;
    installation_info: string | null; quotes?: unknown;
  }>).map((j) => {
    const qRaw = j.quotes;
    const qList = Array.isArray(qRaw) ? qRaw : qRaw ? [qRaw] : [];
    const latest = [...qList].sort((a, b) =>
      ((b as { quote_number: number }).quote_number ?? 0) - ((a as { quote_number: number }).quote_number ?? 0)
    )[0] as { id: string; quote_number: number } | undefined;
    return {
      id: j.id,
      status: j.status,
      estimated_duration_hours: j.estimated_duration_hours,
      preferred_date: j.preferred_date,
      installation_info: j.installation_info,
      quote_number: latest?.quote_number ?? null,
      quote_id: latest?.id ?? null,
    };
  });

  // 2. Historique cross-client (même texte d'adresse, autres installation_addresses)
  let related: RelatedEntry[] = [];
  if (addr.address_formatted) {
    const safe = addr.address_formatted.replace(/[%_\\]/g, "\\$&");
    const { data: others } = await supabase
      .from("installation_addresses")
      .select(
        `id, client_id,
         clients ( name, phone ),
         jobs ( id, status, estimated_duration_hours, preferred_date, installation_info, quotes ( id, quote_number ) )`
      )
      .ilike("address_formatted", safe)
      .neq("id", id)
      .limit(10);

    related = (others ?? []).map((row) => {
      const c = (Array.isArray(row.clients) ? row.clients[0] : row.clients) as
        | { name: string; phone: string | null } | null;
      const rJobs = Array.isArray(row.jobs) ? row.jobs : row.jobs ? [row.jobs] : [];
      const mappedJobs: JobRow[] = (rJobs as Array<{
        id: string; status: string; estimated_duration_hours: number; preferred_date: string | null;
        installation_info: string | null; quotes?: unknown;
      }>).map((j) => {
        const qRaw = j.quotes;
        const qList = Array.isArray(qRaw) ? qRaw : qRaw ? [qRaw] : [];
        const latest = [...qList].sort((a, b) =>
          ((b as { quote_number: number }).quote_number ?? 0) - ((a as { quote_number: number }).quote_number ?? 0)
        )[0] as { id: string; quote_number: number } | undefined;
        return {
          id: j.id,
          status: j.status,
          estimated_duration_hours: j.estimated_duration_hours,
          preferred_date: j.preferred_date,
          installation_info: j.installation_info,
          quote_number: latest?.quote_number ?? null,
          quote_id: latest?.id ?? null,
        };
      });
      return {
        installation_address_id: row.id,
        client_id: row.client_id,
        client_name: c?.name ?? "—",
        client_phone: c?.phone ?? null,
        jobs: mappedJobs,
      };
    });
  }

  // Dernière soumission sur la fiche courante (pour Reprendre)
  const latestJobQuoteId =
    [...jobs]
      .sort((a, b) => (b.quote_number ?? 0) - (a.quote_number ?? 0))
      .find((j) => j.quote_id)
      ?.quote_id ?? null;

  // Vérifier si au moins une soumission existe (fiche + historique croisé)
  const hasAnySoumission =
    jobs.some((j) => j.quote_id) ||
    related.some((e) => e.jobs.some((j) => j.quote_id));

  const addressLine = addr.address_formatted || addr.label || "Adresse sans texte";
  const cityLine = [addr.city, addr.postal_code].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Navigation */}
      <div className="flex items-center gap-2">
        <Link
          href="/clients"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-muted-foreground")}
        >
          <ArrowLeft className="size-3.5" />
          Retour
        </Link>
      </div>

      {/* En-tête adresse */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-emerald-600 shrink-0" />
            <h1 className="text-2xl font-semibold tracking-tight truncate">{addressLine}</h1>
          </div>
          {cityLine && <p className="text-muted-foreground text-sm mt-1 pl-6">{cityLine}</p>}
          {addr.lat != null && (
            <p className="text-[11px] text-muted-foreground pl-6 mt-0.5">
              GPS {addr.lat.toFixed(5)}, {addr.lng?.toFixed(5)}
            </p>
          )}
        </div>
      </div>

      {/* Contact (client actuel) */}
      {client && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Contact actuel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 text-sm">
            <p className="font-semibold">{client.name}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-muted-foreground">
              {client.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"
                >
                  <Phone className="size-3.5" />
                  {client.phone}
                </a>
              )}
              {client.email && <span>{client.email}</span>}
            </div>
            {client.billing_address && (
              <p className="text-xs text-muted-foreground mt-1">
                Facturation : {client.billing_address}
                {client.billing_city &&
                !client.billing_address.toLowerCase().includes(client.billing_city.toLowerCase())
                  ? `, ${client.billing_city}`
                  : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes d'installation */}
      {addr.installation_info && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Notes d&apos;installation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{addr.installation_info}</p>
          </CardContent>
        </Card>
      )}

      {/* Jobs actuels */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Jobs — {client?.name ?? "Client"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {jobs.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground italic">Aucune job pour cette adresse.</p>
          ) : (
            <div className="divide-y divide-border">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
          <div className="px-6 py-3 border-t border-border flex flex-wrap gap-2">
            <NouvellesoumissionButton installationAddressId={addr.id} />
            {hasAnySoumission && (
              <ReprendreButton
                installationAddressId={addr.id}
                sourceQuoteId={latestJobQuoteId ?? undefined}
                label="Reprendre la dernière soumission (prix à zéro)"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Historique cross-client */}
      {related.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Historique du lieu — autres clients
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {related.map((entry) => (
                <div key={entry.installation_address_id} className="px-6 py-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sm text-foreground">{entry.client_name}</p>
                    {entry.client_phone && (
                      <a
                        href={`tel:${entry.client_phone}`}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-sky-700 hover:underline"
                      >
                        <Phone className="size-3" />
                        {entry.client_phone}
                      </a>
                    )}
                    <Link
                      href={`/clients/adresse/${entry.installation_address_id}`}
                      className="ml-auto text-[11px] text-sky-600 hover:underline"
                    >
                      Voir la fiche →
                    </Link>
                  </div>
                  {entry.jobs.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Aucune job.</p>
                  ) : (
                    <div className="space-y-1">
                      {entry.jobs.map((job) => (
                        <div key={job.id} className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusColor(job.status))}>
                            {statusLabel(job.status)}
                          </span>
                          {job.quote_number && (
                            <span className="text-xs text-muted-foreground">#{job.quote_number}</span>
                          )}
                          <Link
                            href={jobFicheLink(job.status, job.id).href}
                            className="text-[11px] text-sky-600 hover:underline inline-flex items-center gap-1"
                          >
                            <ExternalLink className="size-3" />
                            {jobFicheLink(job.status, job.id).label}
                          </Link>
                          {job.quote_id && (
                            <ReprendreButton
                              installationAddressId={addr.id}
                              sourceQuoteId={job.quote_id}
                              label={`Reprendre #${job.quote_number ?? ""}`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── JobCard ───────────────────────────────────────────────────────────────────
function JobCard({ job }: { job: JobRow }) {
  const fiche = jobFicheLink(job.status, job.id);
  return (
    <div className="flex items-center gap-3 px-6 py-2.5">
      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0", statusColor(job.status))}>
        {statusLabel(job.status)}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {job.estimated_duration_hours} h
      </span>
      {job.quote_number ? (
        <Link
          href={`/ventes/soumission/${job.id}`}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1 min-w-0 truncate"
        >
          <FileText className="size-3 shrink-0" />
          #{job.quote_number}
        </Link>
      ) : (
        <span className="text-xs text-muted-foreground italic">Pas de soumission</span>
      )}
      {job.preferred_date && (
        <span className="hidden sm:inline text-xs text-muted-foreground">
          {format(parseISO(job.preferred_date), "d MMM yyyy", { locale: fr })}
        </span>
      )}
      <Link
        href={fiche.href}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 ml-auto shrink-0 text-xs gap-1")}
      >
        Ouvrir
        <ExternalLink className="size-3" />
      </Link>
    </div>
  );
}
