import { format } from "date-fns";
import { fr } from "date-fns/locale";
import Image from "next/image";
import { Printer } from "lucide-react";

import { PrintSelector } from "@/features/impression/print-selector";
import { PrintButton } from "@/features/impression/print-button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Team } from "@/types/domain";

/* ─── Types ─── */
type PrintJob = {
  scheduleId: string;
  slot: "am" | "pm" | "full_day";
  teamName: string;
  teamId: string;
  technicianNames: string[];
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  clientAddress: string | null;
  clientCity: string | null;
  clientPostal: string | null;
  installationInfo: string | null;
  internalNotes: string | null;
  durationHours: number;
};

type TeamWithTechs = Team & { technicianNames: string[] };

/* ─── Chargement des schedules pour une équipe ─── */
async function loadJobsForTeam(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createServerSupabaseClient>>,
  date: string,
  teamId: string,
  teamName: string,
  technicianNames: string[]
): Promise<PrintJob[]> {
  const { data: schedules } = await supabase
    .from("schedules")
    .select(
      `id, slot_type,
       jobs (
         estimated_duration_hours,
         installation_info,
         internal_notes,
         clients ( name, phone, email, address_formatted, city, postal_code )
       )`
    )
    .eq("scheduled_date", date)
    .eq("team_id", teamId)
    .eq("status", "planned")
    .order("slot_type");

  const rawJobs = (schedules ?? []).map((s) => {
    const raw = s as unknown as {
      id: string;
      slot_type: string;
      jobs: {
        estimated_duration_hours: number;
        installation_info: string | null;
        internal_notes: string | null;
        clients: {
          name: string;
          phone: string | null;
          email: string | null;
          address_formatted: string | null;
          city: string | null;
          postal_code: string | null;
        } | null;
      } | null;
    };
    const job = raw.jobs;
    const client = job?.clients;
    return {
      scheduleId: raw.id,
      slot: raw.slot_type as "am" | "pm" | "full_day",
      teamName,
      teamId,
      technicianNames,
      clientName: client?.name ?? "—",
      clientPhone: client?.phone ?? null,
      clientEmail: client?.email ?? null,
      clientAddress: client?.address_formatted ?? null,
      clientCity: client?.city ?? null,
      clientPostal: client?.postal_code ?? null,
      installationInfo: job?.installation_info ?? null,
      internalNotes: job?.internal_notes ?? null,
      durationHours: job?.estimated_duration_hours ?? 4,
    };
  });

  /* Dédupliquer : une job full_day génère un seul enregistrement — pas de doublon AM/PM */
  const seen = new Set<string>();
  return rawJobs.filter((j) => {
    const key = j.scheduleId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ─── Page ─── */
export default async function ImpressionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; team?: string; mode?: string }>;
}) {
  const { date, team: teamParam, mode } = await searchParams;

  const supabase = await createServerSupabaseClient();

  /* Charger équipes actives avec leurs techniciens */
  const { data: teamsRaw } = await supabase
    .from("teams")
    .select(
      `id, name, active, color, notes, created_at,
       team_technicians ( technicians ( first_name, last_name ) )`
    )
    .eq("active", true)
    .order("name");

  const teams: Team[] = ((teamsRaw ?? []) as unknown as Array<{
    id: string; name: string; active: boolean; color: string | null; notes: string | null; created_at: string;
  }>).map((t) => ({
    id: t.id, name: t.name, active: t.active, color: t.color, notes: t.notes, created_at: t.created_at,
  }));

  const teamsWithTechs: TeamWithTechs[] = ((teamsRaw ?? []) as unknown as Array<{
    id: string; name: string; active: boolean; color: string | null; notes: string | null; created_at: string;
    team_technicians: Array<{ technicians: { first_name: string; last_name: string } | null }>;
  }>).map((t) => ({
    id: t.id, name: t.name, active: t.active, color: t.color, notes: t.notes, created_at: t.created_at,
    technicianNames: (t.team_technicians ?? [])
      .map((tt) => tt.technicians ? `${tt.technicians.first_name} ${tt.technicians.last_name}` : null)
      .filter((n): n is string => n !== null),
  }));

  /* Charger les fiches selon la sélection */
  let allPrintJobs: PrintJob[] = [];

  if (date && teamParam) {
    if (teamParam === "all") {
      /* Toutes les équipes */
      for (const team of teamsWithTechs) {
        const jobs = await loadJobsForTeam(supabase, date, team.id, team.name, team.technicianNames);
        allPrintJobs.push(...jobs);
      }
    } else {
      const team = teamsWithTechs.find((t) => t.id === teamParam);
      if (team) {
        allPrintJobs = await loadJobsForTeam(supabase, date, team.id, team.name, team.technicianNames);
      }
    }
  }

  const dateLabel = date
    ? format(new Date(date + "T12:00:00"), "EEEE d MMMM yyyy", { locale: fr })
    : null;

  const selectedTeamName =
    teamParam === "all"
      ? "Toutes les équipes"
      : (teamsWithTechs.find((t) => t.id === teamParam)?.name ?? "");

  /* Grouper par équipe pour l'affichage "toutes équipes" */
  const teamGroups = teamParam === "all"
    ? teamsWithTechs.filter((t) => allPrintJobs.some((j) => j.teamId === t.id))
    : teamsWithTechs.filter((t) => t.id === teamParam);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* En-tête — masqué à l'impression */}
      <div className="print:hidden">
        <div className="flex items-center gap-3">
          <Printer className="size-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Impression</h1>
            <p className="text-muted-foreground text-sm">Fiches de route journalières par équipe.</p>
          </div>
        </div>
      </div>

      {/* Sélecteur — masqué à l'impression */}
      <div className="print:hidden">
        <PrintSelector teams={teams} currentDate={date} currentTeam={teamParam} currentMode={mode} />
      </div>

      {/* Message "aucun résultat" */}
      {date && teamParam && allPrintJobs.length === 0 && (
        <p className="print:hidden text-muted-foreground rounded-lg border px-4 py-6 text-center text-sm">
          Aucune job planifiée pour{" "}
          <strong>{selectedTeamName}</strong> le{" "}
          <strong className="capitalize">{dateLabel}</strong>.
        </p>
      )}

      {/* Fiches imprimables */}
      {allPrintJobs.length > 0 && (
        <>
          {/* Barre d'action — masquée à l'impression */}
          <div className="flex items-center justify-between print:hidden">
            <p className="text-sm text-muted-foreground capitalize">
              {dateLabel} — <strong>{selectedTeamName}</strong> —{" "}
              {allPrintJobs.length} fiche{allPrintJobs.length > 1 ? "s" : ""}
            </p>
            <PrintButton />
          </div>

          {/* Grille des fiches */}
          <div className={mode === "2" ? "grid grid-cols-2 gap-4 print:grid print:grid-cols-2" : "space-y-0"}>
            {teamParam === "all"
              ? teamGroups.flatMap((team) =>
                  allPrintJobs
                    .filter((j) => j.teamId === team.id)
                    .map((job) => (
                      <RouteSheet
                        key={job.scheduleId}
                        job={job}
                        date={dateLabel ?? date ?? ""}
                      />
                    ))
                )
              : allPrintJobs.map((job) => (
                  <RouteSheet key={job.scheduleId} job={job} date={dateLabel ?? date ?? ""} />
                ))
            }
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Fiche de route ─── */
function RouteSheet({
  job,
  date,
}: {
  job: PrintJob;
  date: string;
}) {
  const slotLabel =
    job.slot === "am" ? "Matin (AM)" :
    job.slot === "pm" ? "Après-midi (PM)" :
    "Journée complète";

  return (
    <div
      className="route-sheet rounded-lg border border-gray-300 bg-white p-6 print:break-inside-avoid print:rounded-none print:border print:border-black print:p-8 print:shadow-none"
      style={{ minHeight: "300px" }}
    >
      {/* En-tête fiche : logo + nom entreprise */}
      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3 print:border-black">
        <div className="flex items-center gap-3">
          {/* Logo — affiché si le fichier /public/logo.png existe, sinon texte */}
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded">
            <Image
              src="/logo.jpg"
              alt="Logo Huppé Réfrigération"
              fill
              className="object-contain"
            />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-700">
              Huppé Réfrigération
            </p>
            <p className="text-xs text-gray-500">{job.teamName}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold capitalize text-gray-900">{date}</p>
          <span className="inline-block rounded bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700 print:border print:border-gray-400 print:bg-white">
            {slotLabel}
          </span>
        </div>
      </div>

      {/* Techniciens */}
      {job.technicianNames.length > 0 && (
        <div className="mb-3 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Technicien{job.technicianNames.length > 1 ? "s" : ""}
          </p>
          <p className="text-sm font-medium text-gray-800">
            {job.technicianNames.join(", ")}
          </p>
        </div>
      )}

      {/* Client */}
      <div className="mb-3 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Client</p>
        <p className="text-base font-semibold text-gray-900">{job.clientName}</p>
        {job.clientPhone && <p className="text-sm text-gray-700">{job.clientPhone}</p>}
        {job.clientEmail && <p className="text-sm text-gray-500">{job.clientEmail}</p>}
      </div>

      {/* Adresse */}
      {(job.clientAddress ?? job.clientCity) && (
        <div className="mb-3 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Adresse</p>
          {job.clientAddress && <p className="text-sm text-gray-800">{job.clientAddress}</p>}
          {job.clientCity && (
            <p className="text-sm text-gray-800">
              {job.clientCity}{job.clientPostal ? `, ${job.clientPostal}` : ""}
            </p>
          )}
        </div>
      )}

      {/* Information installation */}
      {job.installationInfo && (
        <div className="mb-3 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Informations sur l&apos;installation
          </p>
          <p className="whitespace-pre-wrap text-sm text-gray-800">{job.installationInfo}</p>
        </div>
      )}

      {/* Notes internes */}
      {job.internalNotes && (
        <div className="rounded bg-yellow-50 p-2 print:border print:border-yellow-300">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700">
            Notes internes
          </p>
          <p className="whitespace-pre-wrap text-sm text-yellow-900">{job.internalNotes}</p>
        </div>
      )}

      {/* Durée + espace signature */}
      <div className="mt-4 flex items-end justify-between">
        <div className="w-48 border-b border-dashed border-gray-300 pb-0.5">
          <p className="text-[10px] text-gray-400">Signature technicien</p>
        </div>
        <span className="text-xs text-gray-400">{job.durationHours} h estimées</span>
      </div>
    </div>
  );
}
