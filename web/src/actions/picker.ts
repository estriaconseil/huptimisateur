"use server";

import {
  haversineMeters,
  haversineSeconds,
  pickClosestByHaversine,
} from "@/lib/maps/haversine";

export type RankedPickerJob = {
  id: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
};

/** Top affiché au clic d'une case vide (vol d'oiseau seulement, 0 Google). */
const HAVERSINE_TOP_N = 10;

/**
 * Classe les jobs les plus proches d'un voisin déjà placé.
 * Pas d'appel Google : la secrétaire n'a pas le client au téléphone,
 * elle parcourt des candidats à rappeler. Vol d'oiseau sur tous les jobs,
 * seuls les N plus proches sont renvoyés (triés).
 */
export async function rankJobsFromOrigin(
  origin: { lat: number; lng: number },
  jobs: { id: string; lat: number | null; lng: number | null }[]
): Promise<{ ok: true; ranked: RankedPickerJob[] } | { ok: false; message: string }> {
  const withCoords = jobs.filter(
    (j): j is { id: string; lat: number; lng: number } => j.lat != null && j.lng != null
  );

  if (withCoords.length === 0) return { ok: true, ranked: [] };

  const coords = withCoords.map((j) => ({ lat: j.lat, lng: j.lng }));
  const closestLocal = pickClosestByHaversine(origin, coords, HAVERSINE_TOP_N);

  const ranked: RankedPickerJob[] = closestLocal.map((i) => {
    const j = withCoords[i];
    const point = { lat: j.lat, lng: j.lng };
    return {
      id: j.id,
      distanceMeters: Math.round(haversineMeters(point, origin)),
      durationSeconds: haversineSeconds(point, origin),
    };
  });

  ranked.sort((a, b) => {
    if (a.durationSeconds == null && b.durationSeconds == null) {
      if (a.distanceMeters == null) return 1;
      if (b.distanceMeters == null) return -1;
      return a.distanceMeters - b.distanceMeters;
    }
    if (a.durationSeconds == null) return 1;
    if (b.durationSeconds == null) return -1;
    return a.durationSeconds - b.durationSeconds;
  });

  console.log(
    `[rankJobsFromOrigin] 0 Google | ${ranked.length} top Haversine / ${withCoords.length} jobs`
  );

  return { ok: true, ranked };
}
