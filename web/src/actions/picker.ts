"use server";

import { fetchDrivingMetricsBatch } from "@/lib/maps/distance-matrix";

export type RankedPickerJob = {
  id: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
};

/**
 * Classe une liste de jobs par distance depuis un point d'origine.
 * Utilise la Distance Matrix Google (1 origine → N destinations).
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

  let metrics: Awaited<ReturnType<typeof fetchDrivingMetricsBatch>>;
  try {
    metrics = await fetchDrivingMetricsBatch(
      apiKey,
      withCoords.map((j) => ({ lat: j.lat, lng: j.lng })),
      origin
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur Distance Matrix";
    return { ok: false, message: msg };
  }

  const ranked: RankedPickerJob[] = withCoords.map((j, i) => ({
    id: j.id,
    distanceMeters: metrics[i]?.meters ?? null,
    durationSeconds: metrics[i]?.seconds ?? null,
  }));

  ranked.sort((a, b) => {
    if (a.distanceMeters == null) return 1;
    if (b.distanceMeters == null) return -1;
    return a.distanceMeters - b.distanceMeters;
  });

  return { ok: true, ranked };
}
