/** Palette de couleurs du calendrier d'installation (demande Stéphane, oct 2026). */
export const SLOT_COLORS = [
  {
    value: "rose",
    label: "Rose/Violet — RDV non confirmé / équip. non reçus",
    hex: "#e879f9",   // fuchsia-400
    textHex: "#ffffff",
  },
  {
    value: "blue_dark",
    label: "Bleu foncé — Projet multi-logements",
    hex: "#1e40af",   // blue-800
    textHex: "#ffffff",
  },
  {
    value: "blue_pale",
    label: "Bleu pâle — Requiert plus d'une équipe",
    hex: "#7dd3fc",   // sky-300
    textHex: "#0c4a6e",
  },
  {
    value: "green",
    label: "Vert — Un technicien est absent",
    hex: "#16a34a",   // green-600
    textHex: "#ffffff",
  },
  {
    value: "yellow",
    label: "Jaune — Attention particulière",
    hex: "#fde047",   // yellow-300
    textHex: "#713f12",
  },
  {
    value: "red",
    label: "Rouge — Réservée pour un contracteur général",
    hex: "#dc2626",   // red-600
    textHex: "#ffffff",
  },
  {
    value: "charcoal",
    label: "Gris charcoal — Équipe non disponible",
    hex: "#52525b",   // zinc-600
    textHex: "#ffffff",
  },
] as const;

export type SlotColorValue = (typeof SLOT_COLORS)[number]["value"];

/** Renvoie les couleurs CSS pour une cellule. */
export function resolveSlotColor(
  colorValue: string | null | undefined,
  defaultBg: string,
  defaultText: string
): { bg: string; text: string } {
  if (!colorValue) return { bg: defaultBg, text: defaultText };
  const found = SLOT_COLORS.find((c) => c.value === colorValue);
  if (found) return { bg: found.hex, text: found.textHex };
  return { bg: defaultBg, text: defaultText };
}
