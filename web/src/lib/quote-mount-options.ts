/** Options montage soumission — demandées par Stéphane (août 2026). */

export const MOUNT_OPTION_DEFS = [
  { id: "regular", label: "Régulier" },
  { id: "inverted", label: "Inversé" },
  { id: "special", label: "Spécial" },
  { id: "inverted_adj", label: "Inversé ajust." },
  { id: "alum_table", label: "Table alum." },
  { id: "plastic_base", label: "Base plast." },
  { id: "diversitech", label: "Diversitech" },
] as const;

export type MountOptionId = (typeof MOUNT_OPTION_DEFS)[number]["id"];

export const MOUNT_OPTION_LABELS: Record<string, string> = Object.fromEntries(
  MOUNT_OPTION_DEFS.map((d) => [d.id, d.label]),
);

/** Lit mount_options[] ou repli sur support_type / floor_mount_type (legacy). */
export function resolveMountOptions(u: {
  mount_options?: string[] | null;
  support_type?: string | null;
  floor_mount_type?: string | null;
}): string[] {
  if (u.mount_options && u.mount_options.length > 0) return u.mount_options;
  return [u.support_type, u.floor_mount_type].filter(
    (v): v is string => !!v && v.trim() !== "",
  );
}

export function formatMountOptions(ids: string[]): string {
  return ids.map((id) => MOUNT_OPTION_LABELS[id] ?? id).join(" · ");
}

export function toggleMountOption(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
}

/** Fusionne anciennes paires longueur/couleur en capage unique (migration UI). */
export function capageFieldsFromUnit(u: {
  cap_long1_length: string | null;
  cap_long1_color: string | null;
  cap_long2_length: string | null;
  cap_long2_color: string | null;
}): { capage_1: string; capage_2: string; capage_3: string; capage_4: string } {
  const l1 = (u.cap_long1_length ?? "").trim();
  const c1 = (u.cap_long1_color ?? "").trim();
  const l2 = (u.cap_long2_length ?? "").trim();
  const c2 = (u.cap_long2_color ?? "").trim();

  const hasSecondPair = !!(l2 || c2);
  if (!hasSecondPair && (l1 || c1)) {
    const merged = l1 && c1 && !l1.includes(c1) ? `${l1} — ${c1}` : l1 || c1;
    return { capage_1: merged, capage_2: "", capage_3: "", capage_4: "" };
  }

  return { capage_1: l1, capage_2: c1, capage_3: l2, capage_4: c2 };
}

export function capageFieldsToDb(f: {
  capage_1: string;
  capage_2: string;
  capage_3: string;
  capage_4: string;
}) {
  return {
    cap_long1_length: f.capage_1.trim() || null,
    cap_long1_color: f.capage_2.trim() || null,
    cap_long2_length: f.capage_3.trim() || null,
    cap_long2_color: f.capage_4.trim() || null,
  };
}
