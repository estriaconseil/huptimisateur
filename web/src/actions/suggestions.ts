"use server";

import { format, parseISO, startOfWeek } from "date-fns";

import { getBusinessWeekDateStrings } from "@/lib/dispatch/business-week";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";
import type { EnrichedScheduleRow } from "@/services/planning/dispatch-state";
import { rankScheduleSuggestions } from "@/services/suggestions/rank-by-distance";
import { DEFAULT_FULL_DAY_THRESHOLD } from "@/lib/constants";
import type { AppSettings, EstimatedDurationHours, Job, ScheduleSuggestion, Team } from "@/types/domain";

export async function getDistanceSuggestionsForJob(
  jobId: string,
  weekStartIso: string,
  targetDateIso?: string
): Promise<
  | { ok: true; suggestions: ScheduleSuggestion[]; warning?: string }
  | { ok: false; message: string }
> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "Clé Google manquante (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Non authentifié" };
  }

  /* Si une date cible est fournie, chercher dans la semaine qui la contient */
  const anchor = parseISO(targetDateIso ?? weekStartIso);
  const monday = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekDates = getBusinessWeekDateStrings(monday);
  const rangeStart = weekDates[0];
  const rangeEnd = weekDates[weekDates.length - 1];

  const [{ data: jobRow, error: jobErr }, { data: teams }, { data: schedRows }, { data: settingsRows }] =
    await Promise.all([
      supabase
        .from("jobs")
        .select("id, estimated_duration_hours, client_id, clients ( lat, lng )")
        .eq("id", jobId)
        .maybeSingle(),
      supabase.from("teams").select("id, name, active, color, notes, created_at").order("name"),
      supabase
        .from("schedules")
        .select(
          `id, job_id, team_id, scheduled_date, slot_type, status,
           jobs ( id, estimated_duration_hours, clients ( name, lat, lng ) )`
        )
        .gte("scheduled_date", rangeStart)
        .lte("scheduled_date", rangeEnd)
        .eq("status", "planned"),
      supabase.from("app_settings").select("*").limit(1).maybeSingle(),
    ]);

  if (jobErr || !jobRow) {
    return { ok: false, message: jobErr?.message ?? "Job introuvable" };
  }

  const rawJob = jobRow as Job & { clients?: unknown };
  const jobClient = unwrapRelation<{ lat: number | null; lng: number | null }>(
    rawJob.clients ?? null
  );
  const lat = jobClient?.lat;
  const lng = jobClient?.lng;

  if (lat == null || lng == null) {
    return {
      ok: true,
      suggestions: [],
      warning: "La job n’a pas de coordonnées (adresse Google) : impossible de calculer les distances.",
    };
  }

  const settings = settingsRows as AppSettings | null;
  const officeLat = settings?.office_lat;
  const officeLng = settings?.office_lng;
  const threshold = settings?.full_day_threshold_hours ?? DEFAULT_FULL_DAY_THRESHOLD;

  if (officeLat == null || officeLng == null) {
    return {
      ok: false,
      message:
        "L'adresse du bureau n'est pas configurée. Rendez-vous dans Paramètres → cliquez « Résoudre les coordonnées GPS » pour l'activer.",
    };
  }

  const schedules: EnrichedScheduleRow[] = (schedRows ?? []).map((raw: unknown) => {
    const row = raw as {
      id: string;
      job_id: string;
      team_id: string;
      scheduled_date: string;
      slot_type: EnrichedScheduleRow["slot_type"];
      status: string;
      jobs: unknown;
    };
    const jo = unwrapRelation<{
      id: string;
      estimated_duration_hours: number;
      clients: unknown;
    }>(row.jobs);
    const job: EnrichedScheduleRow["job"] = jo
      ? {
          id: jo.id,
          estimated_duration_hours: jo.estimated_duration_hours,
          clients: unwrapRelation<{
            name: string;
            city: string | null;
            phone: string | null;
            email: string | null;
            lat: number | null;
            lng: number | null;
          }>(jo.clients),
        }
      : null;
    return {
      id: row.id,
      job_id: row.job_id,
      team_id: row.team_id,
      scheduled_date: row.scheduled_date,
      slot_type: row.slot_type,
      status: row.status,
      job,
    };
  });

  const suggestions = await rankScheduleSuggestions({
    weekDates,
    teams: (teams ?? []) as Team[],
    schedules,
    estimatedDurationHours: rawJob.estimated_duration_hours as EstimatedDurationHours,
    fullDayThresholdHours: threshold,
    jobDestination: { lat: Number(lat), lng: Number(lng) },
    office: { lat: officeLat as number, lng: officeLng as number },
    googleApiKey: apiKey,
  });

  return { ok: true, suggestions };
}
