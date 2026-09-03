"use server";

import { fetchDrivingMetricsBatch } from "@/lib/maps/distance-matrix";
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

/** Max d'éléments Distance Matrix pour le picker (préfiltre Haversine). */
const GOOGLE_TOP_N = 25;

/**
 * Classe une liste de jobs par distance depuis un point d'origine.
 * Préfiltre Haversine → top N → Google ; le reste reste en Haversine.
 * La distance A→B ≈ B→A en conduite, donc on passe les jobs comme origines
 * et l'origine existante comme destination unique (même résultat, API identique).
 */
export async function rankJobsFromOrigin(
  origin: { lat: number; lng: number },
  jobs: { id: string; lat: number | null; lng: number | null }[]
): Promise<{ ok: true; ranked: RankedPickerJob[] } | { ok: false; message: string }> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { ok: false, message: "Clé Google Maps manquante." };

  const withCoords = jobs.filter(
    (j): j is { id: string; lat: number; lng: number } => j.lat != null && j.lng != null
  );

  if (withCoords.length === 0) return { ok: true, ranked: [] };

  const coords = withCoords.map((j) => ({ lat: j.lat, lng: j.lng }));
  const closestLocal = pickClosestByHaversine(origin, coords, GOOGLE_TOP_N);
  const closestSet = new Set(closestLocal);
  const googleJobs = closestLocal.map((i) => withCoords[i]);
  const haversineJobs = withCoords.filter((_, i) => !closestSet.has(i));

  console.log(
    `[rankJobsFromOrigin] ${googleJobs.length} Google (top Haversine/${withCoords.length} jobs) + ` +
      `${haversineJobs.length} Haversine`
  );

  const ranked: RankedPickerJob[] = [];

  if (googleJobs.length > 0) {
    try {
      const metrics = await fetchDrivingMetricsBatch(
        apiKey,
        googleJobs.map((j) => ({ lat: j.lat, lng: j.lng })),
        origin
      );
      googleJobs.forEach((j, i) => {
        ranked.push({
          id: j.id,
          distanceMeters: metrics[i]?.meters ?? null,
          durationSeconds: metrics[i]?.seconds ?? null,
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur Distance Matrix";
      return { ok: false, message: msg };
    }
  }

  for (const j of haversineJobs) {
    ranked.push({
      id: j.id,
      distanceMeters: Math.round(haversineMeters({ lat: j.lat, lng: j.lng }, origin)),
      durationSeconds: haversineSeconds({ lat: j.lat, lng: j.lng }, origin),
    });
  }

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

  return { ok: true, ranked };
}
