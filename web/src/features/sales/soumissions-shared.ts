export type SoumissionRow = {
  id: string;
  quote_number: number;
  client_name: string;
  client_email: string | null;
  quote_date: string;
  status: string;
  /** Montant affiché = option acceptée (B si B, sinon A). */
  subtotal: number;
  /** Option retenue si soumission acceptée. */
  accepted_option: "a" | "b" | null;
  job_id: string | null;
  appointment_id: string | null;
  salesperson_name: string | null;
  scheduled_date: string | null;
};

type QuoteUnitAmount = {
  unit_subtotal: number | null;
  discount_amount: number | null;
  is_alternative: boolean | null;
};

/** Sous-total de l’option retenue (A par défaut) — même logique que le PDF. */
export function displaySubtotalForAcceptedOption(
  acceptedOption: "a" | "b" | null | undefined,
  fallbackSubtotal: number,
  units: QuoteUnitAmount[] | null | undefined
): number {
  const chosenIsB = acceptedOption === "b";
  const list = units ?? [];
  const optionUnits = list.filter((u) => (u.is_alternative ?? false) === chosenIsB);
  if (optionUnits.length === 0) {
    return chosenIsB ? 0 : fallbackSubtotal;
  }
  return optionUnits.reduce((acc, u) => {
    const gross = Number(u.unit_subtotal) || 0;
    const discount = Number(u.discount_amount) || 0;
    return acc + Math.max(0, gross - discount);
  }, 0);
}

/** 10 dernières par défaut (et taille de page). */
export const SOUMISSIONS_PAGE_SIZE = 10;
