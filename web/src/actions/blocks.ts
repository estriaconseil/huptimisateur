"use server";

import { revalidatePath } from "next/cache";

import { requireStaff, requireUser } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Ok  = { ok: true };
type Err = { ok: false; message: string };

export type CreateBlockInput = {
  salesperson_id: string;
  block_type: "vacances" | "bureau" | "autre";
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  notes?: string | null;
};

export type UpdateBlockInput = CreateBlockInput & { id: string };

export async function createSalespersonBlock(input: CreateBlockInput): Promise<{ ok: true; id: string } | Err> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("salesperson_blocks")
    .insert({
      salesperson_id: input.salesperson_id,
      block_type: input.block_type,
      start_date: input.start_date,
      end_date: input.end_date,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };
  revalidatePath("/ventes");
  return { ok: true, id: data.id };
}

export async function updateSalespersonBlock(input: UpdateBlockInput): Promise<Ok | Err> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("salesperson_blocks")
    .update({
      salesperson_id: input.salesperson_id,
      block_type: input.block_type,
      start_date: input.start_date,
      end_date: input.end_date,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      notes: input.notes ?? null,
    })
    .eq("id", input.id);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/ventes");
  return { ok: true };
}

export async function deleteSalespersonBlock(blockId: string): Promise<Ok | Err> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("salesperson_blocks")
    .delete()
    .eq("id", blockId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/ventes");
  return { ok: true };
}

// ── Blocages installation (team_blocks) ──────────────────────────────────────

export type CreateTeamBlockInput = {
  team_id: string;
  blocked_date: string;
  slot_type: "am" | "pm" | "full_day";
  notes?: string | null;
};

export type UpdateTeamBlockInput = CreateTeamBlockInput & { id: string };

export async function createTeamBlock(input: CreateTeamBlockInput): Promise<{ ok: true; id: string } | Err> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("team_blocks")
    .insert({
      team_id: input.team_id,
      blocked_date: input.blocked_date,
      slot_type: input.slot_type,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dispatch");
  return { ok: true, id: data.id };
}

export async function updateTeamBlock(input: UpdateTeamBlockInput): Promise<Ok | Err> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("team_blocks")
    .update({
      team_id: input.team_id,
      blocked_date: input.blocked_date,
      slot_type: input.slot_type,
      notes: input.notes ?? null,
    })
    .eq("id", input.id);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dispatch");
  return { ok: true };
}

export async function deleteTeamBlock(blockId: string): Promise<Ok | Err> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("team_blocks")
    .delete()
    .eq("id", blockId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dispatch");
  return { ok: true };
}
