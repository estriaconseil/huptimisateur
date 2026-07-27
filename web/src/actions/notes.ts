"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/actions/activity";

export type JobNote = {
  id: string;
  content: string;
  created_at: string;
  author_name: string | null;
};

/** Ajoute une note libre sur un job. */
export async function addJobNote(
  jobId: string,
  content: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!content.trim()) return { ok: false, message: "La note ne peut pas être vide." };

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from("job_notes").insert({
    job_id: jobId,
    author_id: user?.id ?? null,
    content: content.trim(),
  });

  if (error) return { ok: false, message: error.message };

  await logActivity(jobId, "note_added", {});

  revalidatePath("/ventes/pipeline");
  revalidatePath("/a-planifier");
  return { ok: true };
}

/** Supprime une note (auteur seulement). */
export async function deleteJobNote(
  noteId: string,
  jobId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("job_notes")
    .delete()
    .eq("id", noteId)
    .eq("author_id", user?.id ?? "");

  if (error) return { ok: false, message: error.message };

  revalidatePath("/ventes/pipeline");
  revalidatePath("/a-planifier");
  return { ok: true };
}

/** Récupère les notes d'un job (plus récentes en premier). */
export async function getJobNotes(
  jobId: string
): Promise<{ ok: true; notes: JobNote[] } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("job_notes")
    .select("id, content, created_at, profiles ( full_name )")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { ok: false, message: error.message };

  const notes: JobNote[] = (data ?? []).map((row: unknown) => {
    const r = row as {
      id: string;
      content: string;
      created_at: string;
      profiles: { full_name: string | null } | null;
    };
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      content: r.content,
      created_at: r.created_at,
      author_name: profile?.full_name ?? null,
    };
  });

  return { ok: true, notes };
}
