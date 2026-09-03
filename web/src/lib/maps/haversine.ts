/**
 * Haversine — distance à vol d'oiseau entre deux coordonnées GPS.
 * Utilisé comme substitut gratuit à Distance Matrix pour les créneaux
 * qui n'ont pas de voisin dans la même journée (pas de trajet à optimiser).
 */

type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;

/** Distance en mètres (vol d'oiseau). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(sin2));
}

/**
 * Durée estimée en secondes.
 * Facteur route 1.3 (route ≈ 30 % plus longue que vol d'oiseau en zone suburbaine).
 * Vitesse moyenne 60 km/h.
 */
export function haversineSeconds(a: LatLng, b: LatLng, avgSpeedKmh = 60): number {
  const roadMeters = haversineMeters(a, b) * 1.3;
  return Math.round(roadMeters / (avgSpeedKmh * 1000 / 3600));
}

/** Comparaison de coordonnées à ±~11 m (4 décimales). */
export function sameCoords(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lng - b.lng) < 0.0001;
}

/**
 * Indices des `limit` points les plus proches de `origin` (vol d'oiseau).
 * Sert à pré-filtrer avant Distance Matrix (ex. top 10 sur 200 RDV).
 */
export function pickClosestByHaversine(
  origin: LatLng,
  candidates: LatLng[],
  limit: number
): number[] {
  if (candidates.length === 0 || limit <= 0) return [];
  const ranked = candidates
    .map((c, i) => ({ i, m: haversineMeters(origin, c) }))
    .sort((a, b) => a.m - b.m);
  return ranked.slice(0, Math.min(limit, ranked.length)).map((x) => x.i);
}
