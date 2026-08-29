/** Cache mémoire en-process avec TTL. Survit aux requêtes dans le même worker Node. */

const store = new Map<string, { value: unknown; expiresAt: number }>();

/**
 * Retourne la valeur en cache si non expirée, sinon appelle `fn`, met en cache et retourne.
 * @param key     Clé unique
 * @param ttlMs   Durée de vie en millisecondes
 * @param fn      Fonction async à appeler en cas de miss
 */
export async function withTtlCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = store.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }
  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/** Vide toutes les entrées expirées (optionnel, évite les fuites mémoire longue durée). */
export function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}
