/** Distance Matrix (classic) — utilisé côté serveur pour classer les suggestions. */

type Element = {
  status: string;
  distance?: { value: number };
  duration?: { value: number };
};

type Row = {
  elements: Element[];
};

export async function fetchDrivingMetricsBatch(
  apiKey: string,
  origins: Array<{ lat: number; lng: number }>,
  destination: { lat: number; lng: number }
): Promise<Array<{ meters: number | null; seconds: number | null; error?: string }>> {
  if (origins.length === 0) return [];

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
    return origins.map(() => ({ meters: null, seconds: null, error: msg }));
  }

  return origins.map((_, i) => {
    const el = data.rows?.[i]?.elements?.[0];
    if (!el || el.status !== "OK") {
      return {
        meters: null,
        seconds: null,
        error: el?.status ?? "NO_ROUTE",
      };
    }
    return {
      meters: el.distance?.value ?? null,
      seconds: el.duration?.value ?? null,
    };
  });
}
