"use server";

import { format, getDay, parse, startOfWeek } from "date-fns";
import { revalidatePath } from "next/cache";

import { logActivity } from "@/actions/activity";
import { requireStaff } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jobBlocksFullDay } from "@/services/planning/slot-rules";
import { isTeamSlotBlocked } from "@/services/suggestions/build-candidates";
import type { JobStatus, ScheduleSlot } from "@/types/domain";

const ASSIGNABLE_STATUSES: JobStatus[] = [
  "a_planifier",
  "retour_a_faire",
  "reparti", // déplacement d'un créneau déjà placé
];

function isWeekendYmd(ymd: string): boolean {
  const d = parse(ymd, "yyyy-MM-dd", new Date());
  const day = getDay(d);
  return day === 0 || day === 6;
}

/**
 * Place une job sur un créneau.
 * Si un schedule planned existe déjà → UPDATE (pas de delete-first).
 * Sinon → INSERT. Le statut job passe à « reparti ».
 */
export async function assignJobToSlot(input: {
  jobId: string;
  teamId: string;
  scheduledDate: string;
  half: "am" | "pm";
  fullDayThresholdHours: number;
  estimatedDurationHours: number;
}) {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  if (isWeekendYmd(input.scheduledDate)) {
    return {
      ok: false as const,
      message: "Les interventions ne sont pas planifiées le samedi ni le dimanche.",
    };
  }

  const { data: job, error: jobFetchErr } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("id", input.jobId)
    .maybeSingle();

  if (jobFetchErr || !job) {
    return { ok: false as const, message: jobFetchErr?.message ?? "Job introuvable" };
  }

  if (!ASSIGNABLE_STATUSES.includes(job.status as JobStatus)) {
    return {
      ok: false as const,
      message: `Impossible de planifier un job en statut « ${job.status} ».`,
    };
  }

  const long = jobBlocksFullDay(input.estimatedDurationHours, input.fullDayThresholdHours);
  const slot_type: ScheduleSlot = long ? "full_day" : input.half;

  const { data: teamBlockRows } = await supabase
    .from("team_blocks")
    .select("id, team_id, blocked_date, slot_type, notes, created_at")
    .eq("team_id", input.teamId)
    .eq("blocked_date", input.scheduledDate);

  if (isTeamSlotBlocked(teamBlockRows ?? [], input.teamId, input.scheduledDate, slot_type)) {
    return { ok: false as const, message: "Ce créneau est bloqué pour cette équipe." };
  }

  const { data: existing } = await supabase
    .from("schedules")
    .select("id")
    .eq("job_id", input.jobId)
    .eq("status", "planned")
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("schedules")
      .update({
        team_id: input.teamId,
        scheduled_date: input.scheduledDate,
        slot_type,
      })
      .eq("id", existing.id);

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false as const,
          message: "Conflit de planification. Réessayez ou choisissez un autre créneau.",
        };
      }
      return { ok: false as const, message: error.message };
    }
  } else {
    const { error } = await supabase.from("schedules").insert({
      job_id: input.jobId,
      team_id: input.teamId,
      scheduled_date: input.scheduledDate,
      slot_type,
      status: "planned",
    });

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false as const,
          message: "Conflit de planification. Réessayez ou choisissez un autre créneau.",
        };
      }
      return { ok: false as const, message: error.message };
    }
  }

  const { error: jobErr } = await supabase
    .from("jobs")
    .update({ status: "reparti" })
    .eq("id", input.jobId);

  if (jobErr) {
    return {
      ok: false as const,
      message: `Créneau enregistré mais statut non mis à jour : ${jobErr.message}`,
    };
  }

  const { data: teamRow } = await supabase
    .from("teams")
    .select("name")
    .eq("id", input.teamId)
    .maybeSingle();
  await logActivity(input.jobId, "schedule_assigned", {
    date: input.scheduledDate,
    slot: slot_type,
    team: (teamRow as { name?: string } | null)?.name ?? input.teamId,
  });

  revalidatePath("/dispatch");
  revalidatePath("/a-planifier");
  return { ok: true as const };
}

export async function removeSchedule(scheduleId: string) {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  const { data: row, error: fetchErr } = await supabase
    .from("schedules")
    .select("job_id")
    .eq("id", scheduleId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false as const, message: fetchErr?.message ?? "Créneau introuvable" };
  }

  const { error } = await supabase.from("schedules").delete().eq("id", scheduleId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  const { count } = await supabase
    .from("schedules")
    .select("*", { count: "exact", head: true })
    .eq("job_id", row.job_id)
    .eq("status", "planned");

  if ((count ?? 0) === 0) {
    await supabase.from("jobs").update({ status: "a_planifier" }).eq("id", row.job_id);
  }

  await logActivity(row.job_id, "schedule_removed", {});

  revalidatePath("/dispatch");
  revalidatePath("/a-planifier");
  return { ok: true as const };
}

/* ─────────────────────────────────────────────────────────────────────────── *
 *  Recherche rapide d'un RDV d'installation (calendrier dispatch)             *
 * ─────────────────────────────────────────────────────────────────────────── */

export type InstallSearchHit = {
  scheduleId: string;
  jobId: string;
  scheduledDate: string; // yyyy-MM-dd
  weekMonday: string; // yyyy-MM-dd — lundi de la semaine à afficher
  teamName: string;
  clientName: string;
  clientCity: string | null;
  installCity: string | null;
};

export async function searchInstallSchedules(
  query: string
): Promise<{ ok: true; results: InstallSearchHit[] } | { ok: false; message: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const q = query.trim().toLowerCase();
  if (q.length < 2) return { ok: true, results: [] };

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("schedules")
    .select(
      `id, job_id, scheduled_date, status,
       teams ( name ),
       jobs (
         id,
         clients ( name, city ),
         installation_addresses!installation_address_id ( city )
       )`
    )
    .eq("status", "planned")
    .order("scheduled_date", { ascending: true });

  if (error) return { ok: false, message: error.message };

  type Rel<T> = T | T[] | null;
  type RawRow = {
    id: string;
    job_id: string;
    scheduled_date: string;
    status: string;
    teams: Rel<{ name: string }>;
    jobs: Rel<{
      id: string;
      clients: Rel<{ name: string; city: string | null }>;
      installation_addresses: Rel<{ city: string | null }>;
    }>;
  };

  function unwrap<T>(v: T | T[] | null | undefined): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }

  const hits: InstallSearchHit[] = [];
  for (const row of (data ?? []) as unknown as RawRow[]) {
    const team = unwrap(row.teams);
    const job = unwrap(row.jobs);
    if (!job) continue;
    const client = unwrap(job.clients);
    const instAddr = unwrap(job.installation_addresses);

    const haystack = [
      client?.name,
      client?.city,
      instAddr?.city,
      team?.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(q)) continue;

    const monday = format(
      startOfWeek(parse(row.scheduled_date, "yyyy-MM-dd", new Date()), {
        weekStartsOn: 1,
      }),
      "yyyy-MM-dd"
    );

    hits.push({
      scheduleId: row.id,
      jobId: job.id,
      scheduledDate: row.scheduled_date,
      weekMonday: monday,
      teamName: team?.name ?? "—",
      clientName: client?.name ?? "—",
      clientCity: client?.city ?? null,
      installCity: instAddr?.city ?? null,
    });

    if (hits.length >= 25) break;
  }

  return { ok: true, results: hits };
}
