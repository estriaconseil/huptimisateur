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

export type CreateTeamBlockRangeInput = {
  team_id: string;
  start_date: string;
  end_date: string;
  /** Créneau appliqué à chaque jour de la plage */
  slot_type: "am" | "pm" | "full_day";
  notes?: string | null;
  /** Défaut true : saute samedi/dimanche */
  weekdays_only?: boolean;
};

function enumDates(start: string, end: string, weekdaysOnly: boolean): string[] {
  const out: string[] = [];
  const a = new Date(start + "T12:00:00");
  const b = new Date(end + "T12:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return out;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay(); // 0=dim, 6=sam
    if (weekdaysOnly && (dow === 0 || dow === 6)) continue;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

/**
 * Bloque une plage de dates pour une équipe (1 ligne team_blocks par jour).
 * Saute les jours déjà bloqués ou déjà occupés par un schedule non annulé.
 */
export async function createTeamBlockRange(
  input: CreateTeamBlockRangeInput
): Promise<
  | { ok: true; created: number; skippedBlocked: number; skippedBusy: number; groupId: string }
  | Err
> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  if (!input.team_id) return { ok: false, message: "Équipe requise." };
  if (!input.start_date || !input.end_date) {
    return { ok: false, message: "Dates de début et de fin requises." };
  }
  if (input.end_date < input.start_date) {
    return { ok: false, message: "La date de fin doit être après la date de début." };
  }

  // Limite de sécurité : max 365 jours calendaires par plage
  const calendarDays =
    Math.round(
      (new Date(input.end_date + "T12:00:00").getTime() -
        new Date(input.start_date + "T12:00:00").getTime()) /
        86_400_000
    ) + 1;
  if (calendarDays > 365) {
    return { ok: false, message: "La plage ne peut pas dépasser 365 jours." };
  }

  const weekdaysOnly = input.weekdays_only !== false;
  const dates = enumDates(input.start_date, input.end_date, weekdaysOnly);
  if (dates.length === 0) {
    return { ok: false, message: "Aucun jour ouvrable dans cette plage." };
  }

  const supabase = await createServerSupabaseClient();

  const { data: existingBlocks } = await supabase
    .from("team_blocks")
    .select("blocked_date, slot_type")
    .eq("team_id", input.team_id)
    .gte("blocked_date", input.start_date)
    .lte("blocked_date", input.end_date);

  const { data: existingSchedules } = await supabase
    .from("schedules")
    .select("scheduled_date, slot_type")
    .eq("team_id", input.team_id)
    .neq("status", "cancelled")
    .gte("scheduled_date", input.start_date)
    .lte("scheduled_date", input.end_date);

  const blocksByDate = new Map<string, string[]>();
  for (const b of existingBlocks ?? []) {
    const row = b as { blocked_date: string; slot_type: string };
    const list = blocksByDate.get(row.blocked_date) ?? [];
    list.push(row.slot_type);
    blocksByDate.set(row.blocked_date, list);
  }

  const schedulesByDate = new Map<string, string[]>();
  for (const s of existingSchedules ?? []) {
    const row = s as { scheduled_date: string; slot_type: string };
    const list = schedulesByDate.get(row.scheduled_date) ?? [];
    list.push(row.slot_type);
    schedulesByDate.set(row.scheduled_date, list);
  }

  function dateBlocked(date: string, want: "am" | "pm" | "full_day"): boolean {
    const slots = blocksByDate.get(date) ?? [];
    if (slots.includes("full_day")) return true;
    if (want === "full_day") return slots.includes("am") || slots.includes("pm") || slots.length > 0;
    return slots.includes(want);
  }

  function dateBusy(date: string, want: "am" | "pm" | "full_day"): boolean {
    const slots = schedulesByDate.get(date) ?? [];
    if (slots.includes("full_day")) return true;
    if (want === "full_day") return slots.length > 0;
    return slots.includes(want) || slots.includes("full_day");
  }

  // UUID partagé par toutes les lignes de cette plage — permet la suppression groupée
  const groupId = crypto.randomUUID();

  const toInsert: {
    team_id: string;
    blocked_date: string;
    slot_type: string;
    notes: string | null;
    group_id: string;
  }[] = [];
  let skippedBlocked = 0;
  let skippedBusy = 0;

  for (const date of dates) {
    if (dateBlocked(date, input.slot_type)) {
      skippedBlocked++;
      continue;
    }
    if (dateBusy(date, input.slot_type)) {
      skippedBusy++;
      continue;
    }
    toInsert.push({
      team_id: input.team_id,
      blocked_date: date,
      slot_type: input.slot_type,
      notes: input.notes ?? null,
      group_id: groupId,
    });
  }

  if (toInsert.length === 0) {
    return {
      ok: false,
      message: `Aucun créneau libre à bloquer (${skippedBlocked} déjà bloqués, ${skippedBusy} occupés).`,
    };
  }

  const { error } = await supabase.from("team_blocks").insert(toInsert);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dispatch");
  return {
    ok: true,
    created: toInsert.length,
    skippedBlocked,
    skippedBusy,
    groupId,
  };
}

/**
 * Retourne le nombre total de lignes dans un groupe (group_id).
 * Utilisé pour afficher le bon count dans le dialog de suppression,
 * même si le calendrier n'affiche qu'une partie des jours.
 */
export async function countTeamBlockGroup(groupId: string): Promise<number> {
  const auth = await requireStaff();
  if (!auth.ok) return 0;

  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from("team_blocks")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);
  return count ?? 0;
}

/**
 * Supprime toutes les lignes d'un même groupe (même group_id).
 * Utilisé pour retirer une plage créée d'un coup.
 */
export async function deleteTeamBlockGroup(groupId: string): Promise<Ok | Err> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("team_blocks")
    .delete()
    .eq("group_id", groupId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dispatch");
  return { ok: true };
}

/**
 * Supprime tous les blocages d'une équipe dans une plage de dates.
 * Utile pour nettoyer les anciens blocages créés sans group_id.
 */
export async function deleteTeamBlockRange(input: {
  team_id: string;
  start_date: string;
  end_date: string;
}): Promise<{ ok: true; deleted: number } | Err> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  if (!input.team_id || !input.start_date || !input.end_date) {
    return { ok: false, message: "Équipe et plage de dates requises." };
  }
  if (input.end_date < input.start_date) {
    return { ok: false, message: "La date de fin doit être après la date de début." };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("team_blocks")
    .delete()
    .eq("team_id", input.team_id)
    .gte("blocked_date", input.start_date)
    .lte("blocked_date", input.end_date)
    .select("id");

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dispatch");
  return { ok: true, deleted: (data ?? []).length };
}
