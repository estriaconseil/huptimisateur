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
  jobId: string
): Promise<{ ok: true; entries: ActivityEntry[] } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("job_activity_log")
    .select("id, action, details, created_at, profiles ( full_name )")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { ok: false, message: error.message };

  const entries: ActivityEntry[] = (data ?? []).map((row: unknown) => {
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

  return { ok: true, entries };
}

