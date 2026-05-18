"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { newClientJobFormSchema } from "@/lib/validations/client-job";

function emptyToNull(s: string | undefined | null): string | null {
  const t = s?.trim();
  return t ? t : null;
}

export async function createClientAndJob(
  raw: unknown
): Promise<{ ok: true; jobId: string } | { ok: false; message: string }> {
  const parsed = newClientJobFormSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" · ");
    return { ok: false, message: msg || "Données invalides" };
  }

  const v = parsed.data;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Non authentifié" };
  }

  const inst = emptyToNull(v.installation_info);

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .insert({
      name: v.name,
      email: v.email === "" ? null : v.email,
      phone: emptyToNull(v.phone),
      address_raw: emptyToNull(v.address_raw),
      address_formatted: emptyToNull(v.address_formatted),
      city: emptyToNull(v.city),
      postal_code: emptyToNull(v.postal_code),
      lat: v.lat ?? null,
      lng: v.lng ?? null,
      installation_info: inst,
    })
    .select("id")
    .single();

  if (clientErr || !client) {
    return { ok: false, message: clientErr?.message ?? "Erreur lors de la création du client" };
  }

  const preferredDate = v.preferred_date === "" ? null : v.preferred_date;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      client_id: client.id,
      installation_info: inst,
      internal_notes: emptyToNull(v.internal_notes),
      estimated_duration_hours: v.estimated_duration_hours,
      preferred_date: preferredDate,
      status: v.status,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    return { ok: false, message: jobErr?.message ?? "Erreur lors de la création de la job" };
  }

  revalidatePath("/dispatch");
  revalidatePath("/nouveau");

  return { ok: true, jobId: job.id };
}
