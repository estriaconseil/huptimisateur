/**
 * Classement des créneaux par distance depuis le bureau (ou un voisin de journée).
 *
 * Règle : Google Distance Matrix seulement si le créneau a un voisin (job adjacent
 * dans la même journée). Sinon → Haversine gratuit, précision suffisante.
 *
 * Logique :
 *   resolveOriginLatLng() retourne soit l'adresse d'un job voisin (AM→PM ou PM→AM),
 *   soit le bureau si la journée est libre. On détecte le cas « bureau » par
 *   comparaison de coordonnées (sameCoords) et on utilise Haversine pour ces slots.
 */

import { fetchDrivingMetricsBatch } from "@/lib/maps/distance-matrix";
import { haversineMeters, haversineSeconds, sameCoords } from "@/lib/maps/haversine";
import { buildAssignmentCandidates, resolveOriginLatLng } from "@/services/suggestions/build-candidates";
import type { EnrichedScheduleRow } from "@/services/planning/dispatch-state";
import type { EstimatedDurationHours, ScheduleSuggestion, Team, TeamBlock } from "@/types/domain";

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

  // Séparer : voisin réel (Google) vs bureau seul (Haversine gratuit)
  const googleCandidates = withOrigins.filter((x) => !sameCoords(x.origin, input.office));
  const haversineCandidates = withOrigins.filter((x) => sameCoords(x.origin, input.office));

  console.log(
    `[RankByDistance] ${googleCandidates.length} Google + ${haversineCandidates.length} Haversine` +
    ` (total candidats: ${withOrigins.length})`
  );

  const results: ScheduleSuggestion[] = [];

  // ── Google : slots avec voisin dans la journée ────────────────────────────
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

  // ── Haversine : slots sur journée sans voisin (départ bureau) ─────────────
  // Toutes ces origines === bureau → même distance vers la destination.
  const haversineSec = haversineSeconds(input.office, input.jobDestination);
  const haversineM = Math.round(haversineMeters(input.office, input.jobDestination));

  for (const item of haversineCandidates) {
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
