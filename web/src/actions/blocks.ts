"use server";

import { revalidatePath } from "next/cache";
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

export async function createSalespersonBlock(input: CreateBlockInput): Promise<{ ok: true; id: string } | Err> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non authentifié" };

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

export async function deleteSalespersonBlock(blockId: string): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non authentifié" };

  const { error } = await supabase
    .from("salesperson_blocks")
    .delete()
    .eq("id", blockId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/ventes");
  return { ok: true };
}
