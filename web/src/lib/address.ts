/** Extrait une ville approximative d'une adresse formatée (CA). */
export function cityFromAddress(address: string | null | undefined): string | null {
  if (!address?.trim()) return null;

  const cleaned = address
    .replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi, "")
    .replace(/\b(Canada|QC|Québec|Quebec)\b/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*$/g, "")
    .trim();

  const parts = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const city = parts[parts.length - 1];
    return city.length >= 2 ? city : null;
  }

  return null;
}

/** Date du jour en YYYY-MM-DD (fuseau America/Toronto). */
export function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isPastYmd(ymd: string, today = todayYmd()): boolean {
  return ymd < today;
}
