/**
 * Classement des créneaux par distance depuis le bureau (ou un voisin de journée).
 *
 * Règle :
 *   1. Jour libre (origine = bureau) → Haversine gratuit
 *   2. Jour avec voisin → Haversine pré-filtre, top N → Google, reste → Haversine
 */

import { fetchDrivingMetricsBatch } from "@/lib/maps/distance-matrix";
import {
  haversineMeters,
  haversineSeconds,
  pickClosestByHaversine,
  sameCoords,
} from "@/lib/maps/haversine";
import { buildAssignmentCandidates, resolveOriginLatLng } from "@/services/suggestions/build-candidates";
import type { EnrichedScheduleRow } from "@/services/planning/dispatch-state";
import type { EstimatedDurationHours, ScheduleSuggestion, Team, TeamBlock } from "@/types/domain";

const BATCH = 25;
/** Max d'éléments Distance Matrix par optimisation dispatch (préfiltre Haversine). */
const GOOGLE_TOP_N = 10;

export async function rankScheduleSuggestions(input: {
  weekDates: string[];
  teams: Team[];
  schedules: EnrichedScheduleRow[];
  estimatedDurationHours: EstimatedDurationHours;
  fullDayThresholdHours: number;
  jobDestination: { lat: number; lng: number };
  office: { lat: number; lng: number };
  googleApiKey: string;
  teamBlocks?: TeamBlock[];
}): Promise<ScheduleSuggestion[]> {
  const candidates = buildAssignmentCandidates(
    input.weekDates,
    input.teams,
    input.schedules,
    input.estimatedDurationHours,
    input.fullDayThresholdHours,
    input.teamBlocks ?? []
  );

  if (candidates.length === 0) return [];

  const withOrigins = candidates.map((c) => ({
    candidate: c,
    origin: resolveOriginLatLng(c, input.schedules, input.office),
  }));

  // Séparer : voisin réel vs bureau seul
  const neighborCandidates = withOrigins.filter((x) => !sameCoords(x.origin, input.office));
  const officeCandidates = withOrigins.filter((x) => sameCoords(x.origin, input.office));

  // Parmi les voisins : top N Haversine → Google, reste → Haversine
  const neighborOrigins = neighborCandidates.map((x) => x.origin);
  const closestLocal = pickClosestByHaversine(
    input.jobDestination,
    neighborOrigins,
    GOOGLE_TOP_N
  );
  const closestSet = new Set(closestLocal);
  const googleCandidates = closestLocal.map((i) => neighborCandidates[i]);
  const neighborHaversine = neighborCandidates.filter((_, i) => !closestSet.has(i));

  console.log(
    `[RankByDistance] ${googleCandidates.length} Google (top Haversine/${neighborCandidates.length} voisins) + ` +
      `${neighborHaversine.length + officeCandidates.length} Haversine` +
      ` (total candidats: ${withOrigins.length})`
  );

  const results: ScheduleSuggestion[] = [];

  // ── Google : top N voisins les plus proches (vol d'oiseau) ────────────────
  for (let i = 0; i < googleCandidates.length; i += BATCH) {
    const chunk = googleCandidates.slice(i, i + BATCH);
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

  // ── Haversine : voisins hors top N ─────────────────────────────────────────
  for (const item of neighborHaversine) {
    results.push({
      teamId: item.candidate.teamId,
      teamName: item.candidate.teamName,
      date: item.candidate.date,
      slot: item.candidate.slot,
      distanceMeters: Math.round(haversineMeters(item.origin, input.jobDestination)),
      durationSeconds: haversineSeconds(item.origin, input.jobDestination),
    });
  }

  // ── Haversine : slots sur journée sans voisin (départ bureau) ─────────────
  const haversineSec = haversineSeconds(input.office, input.jobDestination);
  const haversineM = Math.round(haversineMeters(input.office, input.jobDestination));

  for (const item of officeCandidates) {
    results.push({
      teamId: item.candidate.teamId,
      teamName: item.candidate.teamName,
      date: item.candidate.date,
      slot: item.candidate.slot,
      distanceMeters: haversineM,
      durationSeconds: haversineSec,
    });
  }

  // Tri global : Google (précis) et Haversine (approximatif) comparés ensemble
  results.sort((a, b) => {
    const da = a.durationSeconds;
    const db = b.durationSeconds;
    if (da == null && db == null) {
      const ma = a.distanceMeters;
      const mb = b.distanceMeters;
      if (ma == null && mb == null) return 0;
      if (ma == null) return 1;
      if (mb == null) return -1;
      return ma - mb;
    }
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  return results;
}
