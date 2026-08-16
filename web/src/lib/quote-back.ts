/** Origine d'ouverture d'une soumission — pour le bouton Retour. */
export type QuoteOrigin = "dispatch" | "a-planifier" | "pipeline" | "ventes";

export function parseQuoteOrigin(raw: string | undefined | null): QuoteOrigin | null {
  if (raw === "dispatch" || raw === "a-planifier" || raw === "pipeline" || raw === "ventes") {
    return raw;
  }
  return null;
}

export function quoteBackLink(opts: {
  from?: string | null;
  week?: string | null;
  alreadyConverted?: boolean;
  salesWeek?: string | null;
}): { href: string; label: string } {
  const from = parseQuoteOrigin(opts.from);
  if (from === "dispatch") {
    const q = opts.week ? `?week=${encodeURIComponent(opts.week)}` : "";
    return { href: `/dispatch${q}`, label: "Retour au calendrier installation" };
  }
  if (from === "a-planifier") {
    return { href: "/a-planifier", label: "Retour aux jobs à placer" };
  }
  if (from === "pipeline") {
    return { href: "/ventes/pipeline", label: "Retour au pipeline" };
  }
  if (from === "ventes") {
    const week = opts.week ?? opts.salesWeek;
    return {
      href: week ? `/ventes?week=${encodeURIComponent(week)}` : "/ventes",
      label: "Retour au calendrier ventes",
    };
  }
  if (opts.alreadyConverted) {
    return { href: "/a-planifier", label: "Retour aux jobs à placer" };
  }
  if (opts.salesWeek) {
    return { href: `/ventes?week=${encodeURIComponent(opts.salesWeek)}`, label: "Retour au calendrier ventes" };
  }
  return { href: "/ventes/pipeline", label: "Retour au pipeline" };
}

export function withQuoteOrigin(path: string, from: QuoteOrigin, week?: string | null): string {
  const params = new URLSearchParams();
  params.set("from", from);
  if (week) params.set("week", week);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
