"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type Ok = { ok: true; jobId: string; installationAddressId: string | null };
type Err = { ok: false; message: string };

function n(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

export async function createProspect(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
  /** Adresse de facturation */
  billing_address?: string | null;
  billing_city?: string | null;
  billing_postal?: string | null;
  /** Adresse d'installation */
  install_address?: string | null;
  install_city?: string | null;
  install_postal?: string | null;
  install_lat?: number | null;
  install_lng?: number | null;
  installation_info?: string | null;
  salesperson_id?: string | null;
  /**
   * true = ownership volontaire → suggestions filtrées sur ce vendeur.
   * false = placement flexible (ex. booké depuis un créneau calendrier).
   * Défaut : true si salesperson_id fourni, sinon false.
   */
  salesperson_locked?: boolean;
  /** @deprecated Ancien champ — utiliser install_address */
  address?: string | null;
  /** @deprecated Ancien champ — utiliser install_lat */
  lat?: number | null;
  /** @deprecated Ancien champ — utiliser install_lng */
  lng?: number | null;
}): Promise<Ok | Err> {
  // Rétrocompatibilité : mapper les anciens champs vers les nouveaux
  if (!input.install_address && input.address) input = { ...input, install_address: input.address };
  if (input.install_lat == null && input.lat != null) input = { ...input, install_lat: input.lat };
  if (input.install_lng == null && input.lng != null) input = { ...input, install_lng: input.lng };
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non authentifié" };

  const spId = n(input.salesperson_id);
  // Défaut false : seul un checkbox explicite (salesperson_locked: true) verrouille
  const locked = (input.salesperson_locked === true) && !!spId;

  const billingAddr = n(input.billing_address);

  // 1. Réutiliser un client existant si même adresse de facturation (évite les doublons)
  let clientId: string | null = null;
  if (billingAddr) {
    const { data: existing } = await supabase
      .from("clients")
      .select("id, name, phone, email, billing_address")
      .ilike("billing_address", billingAddr)
      .order("created_at", { ascending: true })
      .limit(20);

    // Match exact insensible à la casse / espaces (ilike seul n'est pas assez strict)
    const match = (existing ?? []).find(
      (c) => (c.billing_address ?? "").trim().toLowerCase() === billingAddr.toLowerCase()
    );
    if (match) {
      clientId = match.id;
      // Enrichir téléphone / courriel manquants sur la fiche existante
      const patch: Record<string, string> = {};
      if (!match.phone && n(input.phone)) patch.phone = n(input.phone)!;
      if (!match.email && n(input.email)) patch.email = n(input.email)!;
      if (Object.keys(patch).length > 0) {
        await supabase.from("clients").update(patch).eq("id", match.id);
      }
    }
  }

  if (!clientId) {
    const { data: client, error: cErr } = await supabase
      .from("clients")
      .insert({
        name: input.name.trim(),
        phone: n(input.phone),
        email: n(input.email),
        billing_address: billingAddr,
        billing_city: n(input.billing_city),
        billing_postal: n(input.billing_postal),
      })
      .select("id")
      .single();

    if (cErr) return { ok: false, message: cErr.message };
    clientId = client.id;
  }

  // 2. Réutiliser une adresse d'installation existante si même texte, sinon en créer une
  const installText = n(input.install_address);
  let installAddrId: string | null = null;

  if (installText) {
    const { data: existingAddrs } = await supabase
      .from("installation_addresses")
      .select("id, address_formatted, lat, lng")
      .eq("client_id", clientId)
      .limit(50);

    const existingInstall = (existingAddrs ?? []).find(
      (a) => (a.address_formatted ?? "").trim().toLowerCase() === installText.toLowerCase()
    );
    if (existingInstall) {
      installAddrId = existingInstall.id;
      // Compléter le GPS si manquant
      if (existingInstall.lat == null && input.install_lat != null) {
        await supabase
          .from("installation_addresses")
          .update({
            lat: input.install_lat,
            lng: input.install_lng ?? null,
            city: n(input.install_city) ?? undefined,
            postal_code: n(input.install_postal) ?? undefined,
          })
          .eq("id", existingInstall.id);
      }
    }
  }

  if (!installAddrId) {
    const { data: installAddr, error: aErr } = await supabase
      .from("installation_addresses")
      .insert({
        client_id: clientId,
        label: "Adresse principale",
        address_formatted: installText,
        city: n(input.install_city),
        postal_code: n(input.install_postal),
        lat: input.install_lat ?? null,
        lng: input.install_lng ?? null,
        installation_info: n(input.installation_info),
      })
      .select("id")
      .single();

    if (aErr) return { ok: false, message: aErr.message };
    installAddrId = installAddr.id;
  }

  // 3. Créer la job en statut initial "soumission_en_attente" (Prospect)
  const { data: job, error: jErr } = await supabase
    .from("jobs")
    .insert({
      client_id: clientId,
      installation_address_id: installAddrId,
      status: "soumission_en_attente",
      estimated_duration_hours: 4,
      created_by: user.id,
      installation_info: n(input.installation_info),
      salesperson_id: spId,
      salesperson_locked: locked && !!spId,
    })
    .select("id")
    .single();

  if (jErr) return { ok: false, message: jErr.message };

  revalidatePath("/ventes/pipeline");
  revalidatePath("/clients");
  return { ok: true, jobId: job.id, installationAddressId: installAddrId };
}

/**
 * Crée une nouvelle adresse d'installation + job prospect pour un client EXISTANT.
 * Permet d'associer plusieurs chantiers au même client (même adresse de facturation).
 */
export async function createProspectForExistingClient(input: {
  client_id: string;
  install_address?: string | null;
  install_city?: string | null;
  install_postal?: string | null;
  install_lat?: number | null;
  install_lng?: number | null;
  installation_info?: string | null;
  salesperson_id?: string | null;
  /** Défaut : true si salesperson_id fourni. Passer false pour un placement flexible. */
  salesperson_locked?: boolean;
}): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non authentifié" };

  const spId = n(input.salesperson_id);
  // Défaut false : seul un checkbox explicite (salesperson_locked: true) verrouille
  const locked = (input.salesperson_locked === true) && !!spId;

  // 1. Créer l'adresse d'installation pour ce client existant
  const { data: installAddr, error: aErr } = await supabase
    .from("installation_addresses")
    .insert({
      client_id: input.client_id,
      label: "Adresse d'installation",
      address_formatted: n(input.install_address),
      city: n(input.install_city),
      postal_code: n(input.install_postal),
      lat: input.install_lat ?? null,
      lng: input.install_lng ?? null,
      installation_info: n(input.installation_info),
    })
    .select("id")
    .single();

  if (aErr) return { ok: false, message: aErr.message };

  // 2. Créer la job liée à cette adresse
  const { data: job, error: jErr } = await supabase
    .from("jobs")
    .insert({
      client_id: input.client_id,
      installation_address_id: installAddr.id,
      status: "soumission_en_attente",
      estimated_duration_hours: 4,
      created_by: user.id,
      installation_info: n(input.installation_info),
      salesperson_id: spId,
      salesperson_locked: locked && !!spId,
    })
    .select("id")
    .single();

  if (jErr) return { ok: false, message: jErr.message };

  revalidatePath("/ventes/pipeline");
  revalidatePath("/clients");
  return { ok: true, jobId: job.id, installationAddressId: installAddr.id };
}
