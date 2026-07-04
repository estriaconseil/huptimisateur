"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type Ok = { ok: true };
type Err = { ok: false; message: string };

export type SalespersonInput = {
  name: string;
  active: boolean;
  home_address: string;
  home_lat: number | null;
  home_lng: number | null;
  notes: string;
};

export type DayConfigInput = {
  day_of_week: number;
  active: boolean;
  work_start_time: string;
  work_end_time: string;
};

export async function createSalesperson(data: SalespersonInput): Promise<{ ok: true; id: string } | Err> {
  const supabase = await createServerSupabaseClient();
  const { data: sp, error } = await supabase
    .from("salespeople")
    .insert({
      name: data.name,
      active: data.active,
      home_address: data.home_address || null,
      home_lat: data.home_lat,
      home_lng: data.home_lng,
      notes: data.notes || null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };

  // Créer la config par défaut lun-ven 08:00–17:00
  const { error: configError } = await supabase.from("salesperson_day_config").insert(
    [1, 2, 3, 4, 5].map((dow) => ({
      salesperson_id: sp.id,
      day_of_week: dow,
      active: true,
      work_start_time: "08:00",
      work_end_time: "17:00",
    }))
  );

  if (configError) return { ok: false, message: `Vendeur créé mais horaire non configuré : ${configError.message}` };

  revalidatePath("/vendeurs");
  revalidatePath("/ventes");
  return { ok: true, id: sp.id };
}

export async function updateSalesperson(id: string, data: SalespersonInput): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("salespeople")
    .update({
      name: data.name,
      active: data.active,
      home_address: data.home_address || null,
      home_lat: data.home_lat,
      home_lng: data.home_lng,
      notes: data.notes || null,
    })
    .eq("id", id);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/vendeurs");
  revalidatePath("/ventes");
  return { ok: true };
}

export async function updateDayConfig(
  salespersonId: string,
  configs: DayConfigInput[]
): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();

  for (const cfg of configs) {
    const { error } = await supabase
      .from("salesperson_day_config")
      .upsert(
        {
          salesperson_id: salespersonId,
          day_of_week: cfg.day_of_week,
          active: cfg.active,
          work_start_time: cfg.work_start_time,
          work_end_time: cfg.work_end_time,
        },
        { onConflict: "salesperson_id,day_of_week" }
      );

    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/vendeurs");
  revalidatePath("/ventes");
  return { ok: true };
}

export async function deleteSalesperson(id: string): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();

  // Bloquer si des RDV futurs existent (le vendeur doit d'abord les transférer)
  const { count: futureCount, error: countErr } = await supabase
    .from("sales_appointments")
    .select("id", { count: "exact", head: true })
    .eq("salesperson_id", id)
    .gte("scheduled_date", new Date().toISOString().slice(0, 10))
    .neq("status", "cancelled");

  if (countErr) return { ok: false, message: countErr.message };

  if (futureCount && futureCount > 0) {
    return {
      ok: false,
      message: `Ce vendeur a ${futureCount} rendez-vous futur${futureCount > 1 ? "s" : ""}. Déplacez-les ou annulez-les avant de le supprimer.`,
    };
  }

  // Si des RDV passés existent, la contrainte FK RESTRICT de Supabase bloquera
  // la suppression — c'est voulu (l'historique doit rester intact).
  const { error } = await supabase.from("salespeople").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        message: "Ce vendeur a des rendez-vous dans l'historique. Désactivez-le plutôt que de le supprimer.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/vendeurs");
  revalidatePath("/ventes");
  return { ok: true };
}

export async function toggleSalespersonActive(id: string, active: boolean): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("salespeople").update({ active }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/vendeurs");
  revalidatePath("/ventes");
  return { ok: true };
}
