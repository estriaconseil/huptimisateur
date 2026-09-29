"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActivityEntry = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
};

/** Ajoute une entrée dans le journal d'activité d'un job. */
export async function logActivity(
  jobId: string,
  action: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("job_activity_log").insert({
    job_id: jobId,
    actor_id: user?.id ?? null,
    action,
    details,
  });
}

/** Récupère le journal d'activité d'un job (plus récent en premier). */
export async function getActivityLog(
  jobId: string,
  /** Nombre max d'entrées à retourner. Défaut 250. */
  limit = 250,
  /** Décalage pour pagination. */
  offset = 0,
): Promise<{ ok: true; entries: ActivityEntry[]; hasMore: boolean } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("job_activity_log")
    .select("id, action, details, created_at, profiles ( full_name )")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) return { ok: false, message: error.message };

  const rows = data ?? [];
  // `.range(offset, offset + limit)` retourne jusqu'à limit+1 rows — on coupe à limit
  const hasMore = rows.length > limit;
  const entries: ActivityEntry[] = rows.slice(0, limit).map((row: unknown) => {
    const r = row as {
      id: string;
      action: string;
      details: Record<string, unknown>;
      created_at: string;
      profiles: { full_name: string | null } | null;
    };
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      action: r.action,
      details: r.details ?? {},
      created_at: r.created_at,
      actor_name: profile?.full_name ?? null,
    };
  });

  return { ok: true, entries, hasMore };
}

