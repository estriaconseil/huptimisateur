"use server";

import { format, getDay, parse, startOfWeek } from "date-fns";
import { revalidatePath } from "next/cache";

import { isTeamSlotBlocked } from "@/services/suggestions/build-candidates";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jobBlocksFullDay } from "@/services/planning/slot-rules";
import { logActivity } from "@/actions/activity";
import type { ScheduleSlot } from "@/types/domain";

function isWeekendYmd(ymd: string): boolean {
  const d = parse(ymd, "yyyy-MM-dd", new Date());
  const day = getDay(d);
  return day === 0 || day === 6;
}

/**
 * Place une job sur un créneau.
 * Remplace atomiquement tout schedule « planned » existant pour cette job
 * (évite les doublons au déplacement).
 */
export async function assignJobToSlot(input: {
  jobId: string;
  teamId: string;
  scheduledDate: string;
  half: "am" | "pm";
  fullDayThresholdHours: number;
  estimatedDurationHours: number;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, message: "Non authentifié" };
  }

  if (isWeekendYmd(input.scheduledDate)) {
    return {
      ok: false as const,
      message: "Les interventions ne sont pas planifiées le samedi ni le dimanche.",
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

  // Libère l'ancien créneau (déplacement / re-placement) avant d'insérer
  const { error: clearErr } = await supabase
    .from("schedules")
    .delete()
    .eq("job_id", input.jobId)
    .eq("status", "planned");

  if (clearErr) {
    return { ok: false as const, message: clearErr.message };
  }

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

  const { error: jobErr } = await supabase
    .from("jobs")
    .update({ status: "reparti" })
    .eq("id", input.jobId);

  if (jobErr) {
    console.error("[assignJobToSlot] Impossible de mettre à jour le statut de la job :", jobErr.message);
  }

  // Journal d'activité
  const { data: teamRow } = await supabase.from("teams").select("name").eq("id", input.teamId).maybeSingle();
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
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, message: "Non authentifié" };
  }

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
  scheduledDate: string;   // yyyy-MM-dd
  weekMonday: string;      // yyyy-MM-dd — lundi de la semaine à afficher
  teamName: string;
  clientName: string;
  clientCity: string | null;
  installCity: string | null;
};

export async function searchInstallSchedules(
  query: string,
): Promise<{ ok: true; results: InstallSearchHit[] } | { ok: false; message: string }> {
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
       )`,
    )
    .eq("status", "planned")
    .order("scheduled_date", { ascending: true });

  if (error) return { ok: false, message: error.message };

  type RawRow = {
    id: string;
    job_id: string;
    scheduled_date: string;
    status: string;
    teams: { name: string } | { name: string }[] | null;
    jobs: {
      id: string;
      clients: { name: string; city: string | null } | { name: string; city: string | null }[] | null;
      installation_addresses: { city: string | null } | { city: string | null }[] | null;
    } | null;
  };

  function unwrap<T>(v: T | T[] | null): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }

  const hits: InstallSearchHit[] = [];
  for (const row of (data ?? []) as RawRow[]) {
    const team = unwrap(row.teams);
    const job = row.jobs;
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

    hits.push({
      scheduleId: row.id,
      jobId: row.job_id,
      scheduledDate: row.scheduled_date,
      weekMonday: format(
        startOfWeek(new Date(row.scheduled_date + "T12:00:00"), { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      ),
      teamName: team?.name ?? "—",
      clientName: client?.name ?? "—",
      clientCity: instAddr?.city ?? client?.city ?? null,
      installCity: instAddr?.city ?? null,
    });
  }

  return { ok: true, results: hits };
}
