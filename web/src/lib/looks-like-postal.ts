/** Code postal canadien A1A 1A1 — souvent collé par l’autofill dans Cap Long. */
const CA_POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s?\d[ABCEGHJ-NPRSTV-Z]\d$/i;

export function looksLikePostalCode(value: string | null | undefined): boolean {
  if (!value) return false;
  return CA_POSTAL.test(value.trim());
}

/** Vide la valeur si c’est un code postal (autofill), sinon la garde. */
export function stripAutofilledPostal(value: string | null | undefined): string {
  const t = (value ?? "").trim();
  if (!t || looksLikePostalCode(t)) return "";
  return t;
}
