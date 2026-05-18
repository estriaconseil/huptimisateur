"use server";

import { revalidatePath } from "next/cache";

import { PG_FK_VIOLATION } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function updateTeamActive(teamId: string, active: boolean) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("teams").update({ active }).eq("id", teamId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/equipes");
  return { ok: true as const };
}

export async function createTeam(data: {
  name: string;
  color?: string | null;
  notes?: string | null;
}) {
  const name = data.name.trim();
  if (!name) {
    return { ok: false as const, message: "Le nom de l'équipe est requis." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("teams").insert({
    name,
    active: true,
    color: data.color ?? null,
    notes: data.notes?.trim() || null,
  });

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/equipes");
  revalidatePath("/dispatch");
  return { ok: true as const };
}

export async function deleteTeam(teamId: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("teams").delete().eq("id", teamId);

  if (error) {
    if (error.code === PG_FK_VIOLATION) {
      return {
        ok: false as const,
        message:
          "Impossible de supprimer cette équipe : elle a des créneaux planifiés. Désactive-la plutôt pour l'exclure du calendrier.",
      };
    }
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/equipes");
  revalidatePath("/dispatch");
  return { ok: true as const };
}
