/** Distance Matrix (classic) — utilisé côté serveur pour classer les suggestions. */

const BATCH_SIZE = 25;

type Element = {
  status: string;
  distance?: { value: number };
  duration?: { value: number };
};

type Row = {
  elements: Element[];
};

type Metric = { meters: number | null; seconds: number | null; error?: string };

async function fetchBatch(
  apiKey: string,
  origins: Array<{ lat: number; lng: number }>,
  destination: { lat: number; lng: number }
): Promise<Metric[]> {
  const format = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
  const originParam = origins.map(format).join("|");
  const destParam = format(destination);

  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?units=metric&mode=driving&origins=${encodeURIComponent(originParam)}` +
    `&destinations=${encodeURIComponent(destParam)}&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    rows?: Row[];
  };

  if (data.status !== "OK" || !data.rows?.length) {
    const msg = data.error_message ?? data.status ?? "Distance Matrix erreur";
    console.error("[Distance Matrix] API error:", data.status, data.error_message ?? "");
    return origins.map(() => ({ meters: null, seconds: null, error: msg }));
  }

  return origins.map((_, i) => {
    const el = data.rows?.[i]?.elements?.[0];
    if (!el || el.status !== "OK") {
      return { meters: null, seconds: null, error: el?.status ?? "NO_ROUTE" };
    }
    return {
      meters: el.distance?.value ?? null,
      seconds: el.duration?.value ?? null,
    };
  });
}

/**
 * 1 origine → N destinations (pour l'optimiseur prospect → créneaux)
 * L'API retourne rows[0].elements[0..N-1]
 */
export async function fetchDrivingMetricsFromOrigin(
  apiKey: string,
  origin: { lat: number; lng: number },
  destinations: Array<{ lat: number; lng: number }>
): Promise<Metric[]> {
  if (destinations.length === 0) return [];

  const fmt = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
  const results: Metric[] = [];

  for (let i = 0; i < destinations.length; i += BATCH_SIZE) {
    const chunk = destinations.slice(i, i + BATCH_SIZE);
    const destParam = chunk.map(fmt).join("|");
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?units=metric&mode=driving&origins=${encodeURIComponent(fmt(origin))}` +
      `&destinations=${encodeURIComponent(destParam)}&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url);
    const data = (await res.json()) as {
      status: string;
      error_message?: string;
      rows?: Row[];
    };

    if (data.status !== "OK" || !data.rows?.length) {
      console.error("[DistMatrix 1→N] API error:", data.status, data.error_message ?? "");
      results.push(...chunk.map(() => ({ meters: null, seconds: null })));
      continue;
    }

    const elements = data.rows[0]?.elements ?? [];
    for (const el of elements) {
      if (!el || el.status !== "OK") {
        results.push({ meters: null, seconds: null });
      } else {
        results.push({
          meters: el.distance?.value ?? null,
          seconds: el.duration?.value ?? null,
        });
      }
    }
  }

  return results;
}

export async function fetchDrivingMetricsBatch(
  apiKey: string,
  origins: Array<{ lat: number; lng: number }>,
  destination: { lat: number; lng: number }
): Promise<Metric[]> {
  if (origins.length === 0) return [];

  const results: Metric[] = [];
  for (let i = 0; i < origins.length; i += BATCH_SIZE) {
    const chunk = origins.slice(i, i + BATCH_SIZE);
    const chunkResults = await fetchBatch(apiKey, chunk, destination);
    results.push(...chunkResults);
  }
  return results;
}
