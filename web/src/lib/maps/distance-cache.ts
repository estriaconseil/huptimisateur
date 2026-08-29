/**
 * Couche de cache Distance Matrix — même logique que le projet RDV :
 *   1. Cache mémoire 5 s  (déduplique les paires dans la même requête)
 *   2. Cache Supabase 14 j (persiste entre requêtes et entre utilisateurs)
 *   3. Batch 40 ms         (regroupe jusqu'à 25 dest/origine → 1 appel Google)
 *   4. Pending map         (deux appels simultanés identiques → 1 seule Promise)
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { withTtlCache } from "@/lib/maps/ttl-cache";

// ─── Config ──────────────────────────────────────────────────────────────────

const TTL_MEMORY_MS = 5_000;          // 5 secondes — déduplique en cours de requête
const TTL_SUPABASE_DAYS = 14;         // 14 jours — persiste en DB
const BATCH_DELAY_MS = 40;            // délai de regroupement avant appel Google
const GOOGLE_BATCH_SIZE = 25;         // limite API Distance Matrix
const PRECISION = 4;                  // décimales lat/lng (~11 m)

// ─── Types ───────────────────────────────────────────────────────────────────

export type DistanceResult = {
  meters: number | null;
  seconds: number | null;
  source?: "memory" | "supabase" | "google" | "disabled" | "error";
};

type LatLng = { lat: number; lng: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function cacheKey(origin: LatLng, dest: LatLng): string {
  return `dm:${round4(origin.lat)},${round4(origin.lng)}=>${round4(dest.lat)},${round4(dest.lng)}`;
}

// ─── Batch queue ─────────────────────────────────────────────────────────────

type QueueEntry = {
  origin: LatLng;
  dest: LatLng;
  resolve: (r: DistanceResult) => void;
  reject: (e: unknown) => void;
};

const queue: QueueEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Pending map : clé → Promise en cours, pour éviter les appels dupliqués simultanés */
const pending = new Map<string, Promise<DistanceResult>>();

/** Flush : regroupe la queue par origine, envoie par batch de 25 dests */
async function flushQueue(apiKey: string): Promise<void> {
  const entries = queue.splice(0, queue.length);
  if (entries.length === 0) return;

  // Grouper par origine (arrondie)
  const byOrigin = new Map<string, QueueEntry[]>();
  for (const entry of entries) {
    const key = `${round4(entry.origin.lat)},${round4(entry.origin.lng)}`;
    const group = byOrigin.get(key) ?? [];
    group.push(entry);
    byOrigin.set(key, group);
  }

  const supabase = createAdminSupabaseClient();

  for (const group of byOrigin.values()) {
    // Traiter par chunks de GOOGLE_BATCH_SIZE
    for (let i = 0; i < group.length; i += GOOGLE_BATCH_SIZE) {
      const chunk = group.slice(i, i + GOOGLE_BATCH_SIZE);
      const origin = chunk[0].origin;
      const dests = chunk.map((e) => e.dest);

      try {
        const metrics = await callGoogleDrivingMatrix(apiKey, origin, dests);

        // Sauvegarder dans Supabase en arrière-plan (pas d'await bloquant)
        void saveToSupabase(supabase, origin, dests, metrics);

        chunk.forEach((entry, j) => {
          const m = metrics[j];
          entry.resolve({
            meters: m?.meters ?? null,
            seconds: m?.seconds ?? null,
            source: "google",
          });
        });
      } catch (err) {
        chunk.forEach((entry) =>
          entry.resolve({ meters: null, seconds: null, source: "error" })
        );
        console.error("[DistanceCache] batch error:", err);
      }
    }
  }
}

// ─── Appel Google brut ───────────────────────────────────────────────────────

async function callGoogleDrivingMatrix(
  apiKey: string,
  origin: LatLng,
  dests: LatLng[]
): Promise<Array<{ meters: number | null; seconds: number | null }>> {
  const fmt = (p: LatLng) => `${p.lat},${p.lng}`;
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?units=metric&mode=driving` +
    `&origins=${encodeURIComponent(fmt(origin))}` +
    `&destinations=${encodeURIComponent(dests.map(fmt).join("|"))}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    rows?: Array<{ elements: Array<{ status: string; distance?: { value: number }; duration?: { value: number } }> }>;
  };

  if (data.status !== "OK" || !data.rows?.length) {
    console.error("[DistanceCache] Google API error:", data.status, data.error_message ?? "");
    return dests.map(() => ({ meters: null, seconds: null }));
  }

  const elements = data.rows[0]?.elements ?? [];
  return dests.map((_, i) => {
    const el = elements[i];
    if (!el || el.status !== "OK") return { meters: null, seconds: null };
    return {
      meters: el.distance?.value ?? null,
      seconds: el.duration?.value ?? null,
    };
  });
}

// ─── Supabase cache ──────────────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

async function lookupSupabase(
  supabase: SupabaseClient,
  origin: LatLng,
  dest: LatLng
): Promise<DistanceResult | null> {
  const cutoff = new Date(Date.now() - TTL_SUPABASE_DAYS * 86_400_000).toISOString();
  const { data } = await supabase
    .from("distance_cache")
    .select("minutes, meters")
    .eq("o_lat4", round4(origin.lat))
    .eq("o_lng4", round4(origin.lng))
    .eq("d_lat4", round4(dest.lat))
    .eq("d_lng4", round4(dest.lng))
    .eq("mode", "driving")
    .gte("created_at", cutoff)
    .maybeSingle();

  if (!data) return null;
  return {
    meters: data.meters ?? null,
    seconds: data.minutes != null ? Math.round(Number(data.minutes) * 60) : null,
    source: "supabase",
  };
}

async function saveToSupabase(
  supabase: SupabaseClient,
  origin: LatLng,
  dests: LatLng[],
  metrics: Array<{ meters: number | null; seconds: number | null }>
): Promise<void> {
  const rows = dests
    .map((dest, i) => {
      const m = metrics[i];
      if (!m || (m.meters === null && m.seconds === null)) return null;
      return {
        o_lat4: round4(origin.lat),
        o_lng4: round4(origin.lng),
        d_lat4: round4(dest.lat),
        d_lng4: round4(dest.lng),
        mode: "driving",
        minutes: m.seconds != null ? m.seconds / 60 : null,
        meters: m.meters,
        created_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("distance_cache")
    .upsert(rows, { onConflict: "o_lat4,o_lng4,d_lat4,d_lng4,mode" });

  if (error) console.error("[DistanceCache] Supabase upsert error:", error.message);
}

// ─── Point d'entrée public ───────────────────────────────────────────────────

/**
 * Calcule la distance de conduite entre deux points.
 * Flux : mémoire 5s → Supabase 14j → batch Google 40ms
 */
export async function getDistance(
  apiKey: string,
  origin: LatLng,
  dest: LatLng
): Promise<DistanceResult> {
  const key = cacheKey(origin, dest);

  // 1. Cache mémoire 5 s
  return withTtlCache<DistanceResult>(key, TTL_MEMORY_MS, async () => {
    // 2. Pending map — partage la Promise si un appel identique est déjà en cours
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const promise = resolveDistance(apiKey, origin, dest, key);
    pending.set(key, promise);
    try {
      return await promise;
    } finally {
      pending.delete(key);
    }
  });
}

async function resolveDistance(
  apiKey: string,
  origin: LatLng,
  dest: LatLng,
  key: string
): Promise<DistanceResult> {
  // 3. Cache Supabase 14 j
  const supabase = createAdminSupabaseClient();
  const cached = await lookupSupabase(supabase, origin, dest);
  if (cached) return cached;

  // 4. Batch Google 40ms
  return new Promise<DistanceResult>((resolve, reject) => {
    queue.push({ origin, dest, resolve, reject });

    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushQueue(apiKey);
      }, BATCH_DELAY_MS);
    }
  });
}

// ─── Helpers multi-paires (wrappers pratiques) ───────────────────────────────

/**
 * N origines → 1 destination (même interface que l'ancienne fetchDrivingMetricsBatch)
 */
export async function getDistanceBatch(
  apiKey: string,
  origins: LatLng[],
  dest: LatLng
): Promise<DistanceResult[]> {
  if (origins.length === 0) return [];
  return Promise.all(origins.map((o) => getDistance(apiKey, o, dest)));
}

/**
 * 1 origine → N destinations (même interface que l'ancienne fetchDrivingMetricsFromOrigin)
 */
export async function getDistanceFromOrigin(
  apiKey: string,
  origin: LatLng,
  dests: LatLng[]
): Promise<DistanceResult[]> {
  if (dests.length === 0) return [];
  return Promise.all(dests.map((d) => getDistance(apiKey, origin, d)));
}
