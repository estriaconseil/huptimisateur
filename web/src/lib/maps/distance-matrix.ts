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
