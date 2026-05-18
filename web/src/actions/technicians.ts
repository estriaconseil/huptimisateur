"use server";

import { revalidatePath } from "next/cache";

import { PG_FK_VIOLATION } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function revalidateAll() {
  revalidatePath("/techniciens");
  revalidatePath("/equipes");
}

export async function createTechnician(data: {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
}) {
  const first_name = data.first_name.trim();
  const last_name = data.last_name.trim();

  if (!first_name || !last_name) {
    return { ok: false as const, message: "Le nom et le prenom sont requis." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("technicians").insert({
    first_name,
    last_name,
    email: data.email?.trim() || null,
    phone: data.phone?.trim() || null,
    active: true,
  });

  if (error) return { ok: false as const, message: error.message };

  revalidateAll();
  return { ok: true as const };
}

export async function updateTechnician(
  id: string,
  data: {
    first_name?: string;
    last_name?: string;
    email?: string | null;
    phone?: string | null;
    active?: boolean;
  }
) {
  const supabase = await createServerSupabaseClient();
  const patch: Record<string, unknown> = {};

  if (data.first_name !== undefined) patch.first_name = data.first_name.trim();
  if (data.last_name !== undefined) patch.last_name = data.last_name.trim();
  if ("email" in data) patch.email = data.email?.trim() || null;
  if ("phone" in data) patch.phone = data.phone?.trim() || null;
  if (data.active !== undefined) patch.active = data.active;

  const { error } = await supabase.from("technicians").update(patch).eq("id", id);

  if (error) return { ok: false as const, message: error.message };

  revalidateAll();
  return { ok: true as const };
}

export async function deleteTechnician(id: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("technicians").delete().eq("id", id);

  if (error) {
    if (error.code === PG_FK_VIOLATION) {
      return {
        ok: false as const,
        message:
          "Ce technicien est assigne a une equipe. Retire-le d'abord de l'equipe, puis supprime-le.",
      };
    }
    return { ok: false as const, message: error.message };
  }

  revalidateAll();
  return { ok: true as const };
}

export async function assignTechnicianToTeam(teamId: string, technicianId: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("team_technicians")
    .insert({ team_id: teamId, technician_id: technicianId });

  if (error) return { ok: false as const, message: error.message };

  revalidateAll();
  return { ok: true as const };
}

export async function removeTechnicianFromTeam(teamId: string, technicianId: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("team_technicians")
    .delete()
    .eq("team_id", teamId)
    .eq("technician_id", technicianId);

  if (error) return { ok: false as const, message: error.message };

  revalidateAll();
  return { ok: true as const };
}
