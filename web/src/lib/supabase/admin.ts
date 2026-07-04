import { createClient } from "@supabase/supabase-js";

/** Client Supabase avec la clé service (côté serveur uniquement — ne jamais exposer au client) */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Variables Supabase admin manquantes");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
