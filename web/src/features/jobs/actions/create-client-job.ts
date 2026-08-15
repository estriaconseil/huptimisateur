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

  // Résoudre les champs d'adresse — nouveaux champs install_* en priorité, sinon ancien champs
  const resolvedInstallAddress = emptyToNull(v.install_address_formatted ?? v.address_formatted);
  const resolvedInstallCity = emptyToNull(v.install_city ?? v.city);
  const resolvedInstallPostal = emptyToNull(v.install_postal_code ?? v.postal_code);
  const resolvedInstallLat = v.install_lat ?? v.lat ?? null;
  const resolvedInstallLng = v.install_lng ?? v.lng ?? null;
  const billingAddr = emptyToNull(v.billing_address ?? resolvedInstallAddress);

  // 1. Réutiliser un client existant si même adresse de facturation
  let clientId: string | null = null;
  if (billingAddr) {
    const { data: existing } = await supabase
      .from("clients")
      .select("id, phone, email, billing_address")
      .ilike("billing_address", billingAddr)
      .order("created_at", { ascending: true })
      .limit(20);

    const match = (existing ?? []).find(
      (c) => (c.billing_address ?? "").trim().toLowerCase() === billingAddr.toLowerCase()
    );
    if (match) {
      clientId = match.id;
      const patch: Record<string, string> = {};
      if (!match.phone && emptyToNull(v.phone)) patch.phone = emptyToNull(v.phone)!;
      if (!match.email && v.email) patch.email = v.email;
      if (Object.keys(patch).length > 0) {
        await supabase.from("clients").update(patch).eq("id", match.id);
      }
    }
  }

  if (!clientId) {
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .insert({
        name: v.name,
        email: v.email === "" ? null : v.email,
        phone: emptyToNull(v.phone),
        billing_address: billingAddr,
        billing_city: emptyToNull(v.billing_city ?? resolvedInstallCity),
        billing_postal: emptyToNull(v.billing_postal ?? resolvedInstallPostal),
      })
      .select("id")
      .single();

    if (clientErr || !client) {
      return { ok: false, message: clientErr?.message ?? "Erreur lors de la création du client" };
    }
    clientId = client.id;
  }

  // 2. Réutiliser l'adresse d'installation si même texte, sinon créer
  let installAddrId: string | null = null;
  if (resolvedInstallAddress) {
    const { data: existingAddrs } = await supabase
      .from("installation_addresses")
      .select("id, address_formatted, lat")
      .eq("client_id", clientId)
      .limit(50);

    const existingInstall = (existingAddrs ?? []).find(
      (a) =>
        (a.address_formatted ?? "").trim().toLowerCase() ===
        resolvedInstallAddress.toLowerCase()
    );
    if (existingInstall) {
      installAddrId = existingInstall.id;
      if (existingInstall.lat == null && resolvedInstallLat != null) {
        await supabase
          .from("installation_addresses")
          .update({
            lat: resolvedInstallLat,
            lng: resolvedInstallLng,
            city: resolvedInstallCity ?? undefined,
            postal_code: resolvedInstallPostal ?? undefined,
          })
          .eq("id", existingInstall.id);
      }
    }
  }

  if (!installAddrId) {
    const { data: installAddr, error: addrErr } = await supabase
      .from("installation_addresses")
      .insert({
        client_id: clientId,
        label: "Adresse principale",
        address_formatted: resolvedInstallAddress,
        city: resolvedInstallCity,
        postal_code: resolvedInstallPostal,
        lat: resolvedInstallLat,
        lng: resolvedInstallLng,
        installation_info: inst,
      })
      .select("id")
      .single();

    if (addrErr || !installAddr) {
      return { ok: false, message: addrErr?.message ?? "Erreur lors de la création de l'adresse" };
    }
    installAddrId = installAddr.id;
  }

  const preferredDate = v.preferred_date === "" ? null : v.preferred_date;

  // 3. Créer la job liée au client ET à l'adresse d'installation
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      client_id: clientId,
      installation_address_id: installAddrId,
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
  revalidatePath("/clients");

  return { ok: true, jobId: job.id };
}
