"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type Ok = { ok: true; jobId: string };
type Err = { ok: false; message: string };

export async function createProspect(input: {
  name: string;
  phone: string;
  email: string;
  address: string;
  lat: number | null;
  lng: number | null;
  installation_info?: string | null;
  salesperson_id?: string | null;
}): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non authentifié" };

  // 1. Créer le client
  const { data: client, error: cErr } = await supabase
    .from("clients")
    .insert({
      name: input.name.trim(),
      phone: input.phone || null,
      email: input.email || null,
      address_formatted: input.address || null,
      lat: input.lat,
      lng: input.lng,
    })
    .select("id")
    .single();

  if (cErr) return { ok: false, message: cErr.message };

  // 2. Créer la job en statut "prospect"
  const { data: job, error: jErr } = await supabase
    .from("jobs")
    .insert({
      client_id: client.id,
      status: "prospect",
      estimated_duration_hours: 4,
      created_by: user.id,
      installation_info: input.installation_info || null,
      salesperson_id: input.salesperson_id || null,
    })
    .select("id")
    .single();

  if (jErr) return { ok: false, message: jErr.message };

  revalidatePath("/ventes/pipeline");
  revalidatePath("/clients");
  return { ok: true, jobId: job.id };
}
