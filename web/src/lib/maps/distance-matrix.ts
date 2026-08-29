/**
 * Distance Matrix — point d'entrée unifié.
 * Toutes les requêtes passent par distance-cache.ts :
 *   1. Cache mémoire 5 s
 *   2. Cache Supabase 14 j
 *   3. Batch Google 40 ms (≤ 25 dest/origine)
 *   4. Pending map (déduplique les appels simultanés)
 */

import { getDistanceBatch, getDistanceFromOrigin } from "@/lib/maps/distance-cache";

const DISABLED =
  process.env.DISABLE_DISTANCE_MATRIX === "true" ||
  process.env.DISABLE_DISTANCE_MATRIX === "1";

export type Metric = { meters: number | null; seconds: number | null; error?: string };

function disabledMetrics(count: number): Metric[] {
  return Array.from({ length: count }, () => ({
    meters: null,
    seconds: null,
    error: "Distance Matrix désactivé (DISABLE_DISTANCE_MATRIX=true)",
  }));
}

/**
 * N origines → 1 destination
 * (utilisé par l'optimiseur dispatch et le picker)
 */
export async function fetchDrivingMetricsBatch(
  apiKey: string,
  origins: Array<{ lat: number; lng: number }>,
  destination: { lat: number; lng: number }
): Promise<Metric[]> {
  if (origins.length === 0) return [];
  if (DISABLED) return disabledMetrics(origins.length);

  const results = await getDistanceBatch(apiKey, origins, destination);
  return results.map((r) => ({
    meters: r.meters,
    seconds: r.seconds,
    ...(r.source === "error" ? { error: "Distance Matrix erreur" } : {}),
  }));
}

/**
 * 1 origine → N destinations
 * (utilisé par l'optimiseur ventes et le calcul de créneaux)
 */
export async function fetchDrivingMetricsFromOrigin(
  apiKey: string,
  origin: { lat: number; lng: number },
  destinations: Array<{ lat: number; lng: number }>
): Promise<Metric[]> {
  if (destinations.length === 0) return [];
  if (DISABLED) return disabledMetrics(destinations.length);

  const results = await getDistanceFromOrigin(apiKey, origin, destinations);
  return results.map((r) => ({
    meters: r.meters,
    seconds: r.seconds,
    ...(r.source === "error" ? { error: "Distance Matrix erreur" } : {}),
  }));
}
