"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { EditClientFormValues, EditJobFormValues } from "@/lib/validations/client-job";

export async function updateClient(
  clientId: string,
  data: EditClientFormValues
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("clients")
    .update({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      address_formatted: data.address_formatted || null,
      city: data.city || null,
      postal_code: data.postal_code || null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    })
    .eq("id", clientId);

  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/clients");
  revalidatePath("/dispatch");
  revalidatePath("/ventes/pipeline");
  return { ok: true as const };
}

export async function updateJob(
  jobId: string,
  data: EditJobFormValues
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("jobs")
    .update({
      status: data.status,
      estimated_duration_hours: data.estimated_duration_hours,
      preferred_date: data.preferred_date || null,
      follow_up_date: data.follow_up_date !== undefined ? (data.follow_up_date || null) : undefined,
      salesperson_id: data.salesperson_id !== undefined ? (data.salesperson_id || null) : undefined,
      installation_info: data.installation_info || null,
      internal_notes: data.internal_notes || null,
    })
    .eq("id", jobId);

  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/clients");
  revalidatePath("/a-planifier");
  revalidatePath("/dispatch");
  revalidatePath("/ventes/pipeline");
  return { ok: true as const };
}
