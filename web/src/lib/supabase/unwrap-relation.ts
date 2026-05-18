/** Supabase renvoie parfois une relation 1‑1 sous forme de tableau avec un élément. */
export function unwrapRelation<T extends object>(v: unknown): T | null {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] as T | undefined) ?? null;
  return v as T;
}
