import { fetchDrivingMetricsBatch } from "@/lib/maps/distance-matrix";
import { buildAssignmentCandidates, resolveOriginLatLng } from "@/services/suggestions/build-candidates";
import type { EnrichedScheduleRow } from "@/services/planning/dispatch-state";
import type { EstimatedDurationHours, ScheduleSuggestion, Team } from "@/types/domain";

const BATCH = 25;

export async function rankScheduleSuggestions(input: {
  weekDates: string[];
  teams: Team[];
  schedules: EnrichedScheduleRow[];
  estimatedDurationHours: EstimatedDurationHours;
  fullDayThresholdHours: number;
  jobDestination: { lat: number; lng: number };
  office: { lat: number; lng: number };
  googleApiKey: string;
}): Promise<ScheduleSuggestion[]> {
  const candidates = buildAssignmentCandidates(
    input.weekDates,
    input.teams,
    input.schedules,
    input.estimatedDurationHours,
    input.fullDayThresholdHours
  );

  if (candidates.length === 0) return [];

  const withOrigins = candidates.map((c) => ({
    candidate: c,
    origin: resolveOriginLatLng(c, input.schedules, input.office),
  }));

  const results: ScheduleSuggestion[] = [];

  for (let i = 0; i < withOrigins.length; i += BATCH) {
    const chunk = withOrigins.slice(i, i + BATCH);
    const origins = chunk.map((x) => x.origin);
    const metrics = await fetchDrivingMetricsBatch(
      input.googleApiKey,
      origins,
      input.jobDestination
    );

    chunk.forEach((item, j) => {
      const m = metrics[j];
      results.push({
        teamId: item.candidate.teamId,
        teamName: item.candidate.teamName,
        date: item.candidate.date,
        slot: item.candidate.slot,
        distanceMeters: m?.meters ?? null,
        durationSeconds: m?.seconds ?? null,
      });
    });
  }

  results.sort((a, b) => {
    const da = a.distanceMeters;
    const db = b.distanceMeters;
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  return results;
}
