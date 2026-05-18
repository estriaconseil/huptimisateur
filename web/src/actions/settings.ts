"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SettingsPayload = {
  office_address: string;
  office_lat: number | null;
  office_lng: number | null;
  am_start: string;
  am_end: string;
  pm_start: string;
  pm_end: string;
  full_day_threshold_hours: number;
};

export async function saveAppSettings(data: SettingsPayload) {
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("app_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  const payload = {
    office_address: data.office_address.trim() || null,
    office_lat: data.office_lat,
    office_lng: data.office_lng,
    am_start: data.am_start,
    am_end: data.am_end,
    pm_start: data.pm_start,
    pm_end: data.pm_end,
    full_day_threshold_hours: data.full_day_threshold_hours,
    updated_at: new Date().toISOString(),
  };

  let error;
  if (existing?.id) {
    ({ error } = await supabase
      .from("app_settings")
      .update(payload)
      .eq("id", existing.id));
  } else {
    ({ error } = await supabase.from("app_settings").insert(payload));
  }

  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/parametres");
  revalidatePath("/dispatch");
  return { ok: true as const };
}
