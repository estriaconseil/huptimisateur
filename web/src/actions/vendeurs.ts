"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-role";
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
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

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

  // Créer la config par défaut lun-ven 09:00–19:30 (créneaux soir inclus)
  const { error: configError } = await supabase.from("salesperson_day_config").insert(
    [1, 2, 3, 4, 5].map((dow) => ({
      salesperson_id: sp.id,
      day_of_week: dow,
      active: true,
      work_start_time: "09:00",
      work_end_time: "19:30",
    }))
  );

  if (configError) return { ok: false, message: `Vendeur créé mais horaire non configuré : ${configError.message}` };

  revalidatePath("/vendeurs");
  revalidatePath("/ventes");
  return { ok: true, id: sp.id };
}

export async function updateSalesperson(id: string, data: SalespersonInput): Promise<Ok | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

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
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

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
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

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
        message: "Ce vendeur a des rendez-vous ou données liées. Utilisez « Supprimer avec toutes les données » pour supprimer un vendeur test, ou désactivez-le pour conserver l'historique.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/vendeurs");
  revalidatePath("/ventes");
  return { ok: true };
}

/**
 * Suppression forcée : efface toutes les données liées (RDV, blocs, détache jobs/quotes)
 * avant de supprimer le vendeur. À utiliser uniquement pour des données test.
 */
export async function forceDeleteSalesperson(id: string): Promise<Ok | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  // 1. Supprimer les blocs horaires
  const { error: blocksErr } = await supabase
    .from("salesperson_blocks")
    .delete()
    .eq("salesperson_id", id);
  if (blocksErr) return { ok: false, message: `Erreur blocs : ${blocksErr.message}` };

  // 2. Détacher les jobs liés (mettre salesperson_id à null)
  const { error: jobsErr } = await supabase
    .from("jobs")
    .update({ salesperson_id: null, salesperson_locked: false })
    .eq("salesperson_id", id);
  if (jobsErr) return { ok: false, message: `Erreur jobs : ${jobsErr.message}` };

  // 3. Détacher les soumissions liées
  const { error: quotesErr } = await supabase
    .from("quotes")
    .update({ salesperson_id: null })
    .eq("salesperson_id", id);
  if (quotesErr) return { ok: false, message: `Erreur soumissions : ${quotesErr.message}` };

  // 4. Supprimer tous les rendez-vous (y compris passés)
  const { error: apptErr } = await supabase
    .from("sales_appointments")
    .delete()
    .eq("salesperson_id", id);
  if (apptErr) return { ok: false, message: `Erreur rendez-vous : ${apptErr.message}` };

  // 5. Supprimer le vendeur
  const { error } = await supabase.from("salespeople").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/vendeurs");
  revalidatePath("/ventes");
  revalidatePath("/ventes/pipeline");
  return { ok: true };
}

export async function toggleSalespersonActive(id: string, active: boolean): Promise<Ok | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("salespeople").update({ active }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/vendeurs");
  revalidatePath("/ventes");
  return { ok: true };
}

/**
 * Lie (ou délie) un vendeur à un compte de connexion via `profile_id`.
 * `profileId = null` supprime le lien.
 */
export async function linkSalespersonToProfile(
  salespersonId: string,
  profileId: string | null
): Promise<Ok | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  // S'assurer qu'aucun autre vendeur n'est déjà lié à ce compte
  if (profileId) {
    const { data: existing } = await supabase
      .from("salespeople")
      .select("id, name")
      .eq("profile_id", profileId)
      .neq("id", salespersonId)
      .maybeSingle();
    if (existing) {
      const row = existing as { id: string; name: string };
      return {
        ok: false,
        message: `Ce compte est déjà lié au vendeur « ${row.name} ». Déliez-le d'abord.`,
      };
    }
  }

  const { error } = await supabase
    .from("salespeople")
    .update({ profile_id: profileId })
    .eq("id", salespersonId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/vendeurs");
  revalidatePath("/ventes");
  revalidatePath("/ventes/pipeline");
  return { ok: true };
}
