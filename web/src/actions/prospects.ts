"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { duplicateQuote } from "@/actions/sales";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";
import type { PipelineInstallationAddress, PipelineJob } from "@/features/sales/pipeline-client";
import type { FollowUpFlag, JobStatus } from "@/types/domain";

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

  // Champs obligatoires pour tout nouveau prospect
  if (!input.name?.trim()) return { ok: false, message: "Le nom du client est requis." };
  if (!n(input.phone)) return { ok: false, message: "Le numéro de téléphone est requis." };
  const emailTrimmed = input.email?.trim() ?? "";
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrimmed);
  if (!emailValid) return { ok: false, message: "Le courriel est requis et doit être valide (ex. nom@domaine.com)." };
  if (!n(input.install_address)) return { ok: false, message: "L'adresse d'installation est requise." };
  if (!n(input.billing_address)) {
    return {
      ok: false,
      message: "L'adresse de facturation est requise (ou même adresse que l'installation).",
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non authentifié" };

  const spId = n(input.salesperson_id);
  // Défaut false : seul un checkbox explicite (salesperson_locked: true) verrouille
  const locked = (input.salesperson_locked === true) && !!spId;

  const billingAddr = n(input.billing_address);

  // 1. Toujours créer un nouveau client — chaque prospect est une personne distincte.
  // La protection anti-doublon se fait via l'interception d'adresse d'installation
  // (checkInstallationAddressExists) dans le formulaire, pas ici.
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
  const clientId = client.id;

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

// ── checkInstallationAddressExists ───────────────────────────────────────────

export type AddressMatch = {
  installation_address_id: string;
  address_formatted: string;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  jobs: Array<{ id: string; status: string; quote_number: number | null }>;
};

/**
 * Recherche cross-client : toutes les adresses d'installation avec le même texte
 * (insensible à la casse). Utile pour prévenir les doublons lors de la création.
 */
export async function checkInstallationAddressExists(
  installText: string
): Promise<{ ok: true; matches: AddressMatch[] } | { ok: false; message: string }> {
  if (!installText?.trim()) return { ok: true as const, matches: [] };

  const supabase = await createServerSupabaseClient();
  const safe = installText.trim().replace(/[%_\\]/g, "\\$&");

  const { data, error } = await supabase
    .from("installation_addresses")
    .select(
      `id, address_formatted, client_id,
       clients ( name, phone ),
       jobs ( id, status, quotes ( quote_number ) )`
    )
    .ilike("address_formatted", safe)
    .limit(10);

  if (error) return { ok: false as const, message: error.message };

  const matches: AddressMatch[] = (data ?? []).map((row) => {
    const client = (Array.isArray(row.clients) ? row.clients[0] : row.clients) as
      | { name: string; phone: string | null }
      | null;
    const rawJobs = Array.isArray(row.jobs) ? row.jobs : row.jobs ? [row.jobs] : [];
    const jobs = (rawJobs as Array<{ id: string; status: string; quotes?: unknown }>).map((j) => {
      const qRaw = j.quotes;
      const qList = Array.isArray(qRaw) ? qRaw : qRaw ? [qRaw] : [];
      const latest = [...qList].sort((a, b) =>
        ((b as { quote_number: number }).quote_number ?? 0) - ((a as { quote_number: number }).quote_number ?? 0)
      )[0] as { quote_number: number } | undefined;
      return { id: j.id, status: j.status, quote_number: latest?.quote_number ?? null };
    });
    return {
      installation_address_id: row.id,
      address_formatted: row.address_formatted ?? installText,
      client_id: row.client_id,
      client_name: client?.name ?? "—",
      client_phone: client?.phone ?? null,
      jobs,
    };
  });

  return { ok: true as const, matches };
}

// ── createJobOnExistingAddress ────────────────────────────────────────────────

type JobOk = { ok: true; jobId: string; installLat: number | null; installLng: number | null };
type JobErr = { ok: false; message: string };

/**
 * Crée une nouvelle job Prospect sur une adresse d'installation DÉJÀ dans la BD.
 *
 * Deux chemins :
 * - `newOwner`  : crée un nouveau client (billing copié de l'ancien) + nouvelle
 *                 row installation_addresses (même texte / GPS, sans installation_info).
 * - sans newOwner: réutilise le client et l'adresse existants.
 *                  Si `enrichWith` est fourni, complète les champs vides du client.
 *
 * Si mode = "duplicate" : copie la dernière soumission du lieu (prix à zéro).
 * Retourne le GPS de la row existante pour permettre findBestSlotsForProspect.
 */
export async function createJobOnExistingAddress(input: {
  installationAddressId: string;
  mode: "blank" | "duplicate";
  /**
   * Si fourni, utilise cette soumission comme source pour la duplication.
   * Utile pour « Reprendre » depuis l'historique croisé (autre client, même lieu).
   * Si absent en mode duplicate, prend automatiquement la dernière soumission du lieu.
   */
  sourceQuoteId?: string | null;
  newOwner?: { name: string; phone?: string | null; email?: string | null };
  enrichWith?: { phone?: string | null; email?: string | null };
}): Promise<JobOk | JobErr> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non authentifié" };

  // 1. Charger la row adresse + client (billing pour copie éventuelle)
  type AddrClientRow = {
    id: string;
    phone: string | null;
    email: string | null;
    billing_address: string | null;
    billing_city: string | null;
    billing_postal: string | null;
  };

  type AddrRow = {
    id: string;
    address_formatted: string | null;
    city: string | null;
    postal_code: string | null;
    lat: number | null;
    lng: number | null;
    client_id: string;
    clients: AddrClientRow | AddrClientRow[] | null;
  };

  const { data: addrRowRaw, error: addrErr } = await supabase
    .from("installation_addresses")
    .select("id, address_formatted, city, postal_code, lat, lng, client_id, clients ( id, phone, email, billing_address, billing_city, billing_postal )")
    .eq("id", input.installationAddressId)
    .single();

  if (addrErr || !addrRowRaw) {
    return { ok: false, message: addrErr?.message ?? "Adresse introuvable" };
  }

  const addrRow = addrRowRaw as unknown as AddrRow;

  const existingClient = (
    Array.isArray(addrRow.clients) ? addrRow.clients[0] : addrRow.clients
  ) as AddrClientRow | null;

  // 2. Trouver la dernière soumission de ce lieu (pour mode duplicate)
  let latestQuoteId: string | null = input.sourceQuoteId ?? null;
  if (input.mode === "duplicate" && !latestQuoteId) {
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id")
      .eq("installation_address_id", input.installationAddressId);

    const jobIds = (jobs ?? []).map((j) => j.id);
    if (jobIds.length > 0) {
      const { data: latestQuote } = await supabase
        .from("quotes")
        .select("id, quote_number")
        .in("job_id", jobIds)
        .order("quote_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      latestQuoteId = latestQuote?.id ?? null;
    }
  }

  // 3. Résoudre le client + l'adresse d'installation cibles
  let targetClientId: string = addrRow.client_id;
  let targetInstallAddressId: string = addrRow.id;

  if (input.newOwner) {
    // Nouveau propriétaire : nouveau client, nouvelle row adresse (même texte + GPS)
    const { data: newClient, error: cErr } = await supabase
      .from("clients")
      .insert({
        name: input.newOwner.name.trim(),
        phone: n(input.newOwner.phone),
        email: n(input.newOwner.email),
        billing_address: existingClient?.billing_address ?? n(addrRow.address_formatted),
        billing_city: existingClient?.billing_city ?? n(addrRow.city),
        billing_postal: existingClient?.billing_postal ?? n(addrRow.postal_code),
      })
      .select("id")
      .single();

    if (cErr || !newClient) return { ok: false, message: cErr?.message ?? "Erreur création client" };
    targetClientId = newClient.id;

    const { data: newAddr, error: aErr } = await supabase
      .from("installation_addresses")
      .insert({
        client_id: newClient.id,
        label: "Adresse principale",
        address_formatted: addrRow.address_formatted,
        city: addrRow.city,
        postal_code: addrRow.postal_code,
        lat: addrRow.lat,
        lng: addrRow.lng,
        // installation_info intentionnellement omis
      })
      .select("id")
      .single();

    if (aErr || !newAddr) return { ok: false, message: aErr?.message ?? "Erreur création adresse" };
    targetInstallAddressId = newAddr.id;

  } else if (input.enrichWith && existingClient) {
    // Même personne : compléter les champs vides seulement
    const enrichPatch: Record<string, string> = {};
    if (!existingClient.phone && n(input.enrichWith.phone)) enrichPatch.phone = n(input.enrichWith.phone)!;
    if (!existingClient.email && n(input.enrichWith.email)) enrichPatch.email = n(input.enrichWith.email)!;
    if (Object.keys(enrichPatch).length > 0) {
      await supabase.from("clients").update(enrichPatch).eq("id", existingClient.id);
    }
  }

  // 4. Créer la job Prospect
  const { data: job, error: jErr } = await supabase
    .from("jobs")
    .insert({
      client_id: targetClientId,
      installation_address_id: targetInstallAddressId,
      status: "soumission_en_attente",
      estimated_duration_hours: 4,
      created_by: user.id,
      salesperson_id: null,
      salesperson_locked: false,
    })
    .select("id")
    .single();

  if (jErr || !job) return { ok: false, message: jErr?.message ?? "Erreur création job" };

  // 5. Dupliquer la dernière soumission si demandé
  if (input.mode === "duplicate" && latestQuoteId) {
    const dupRes = await duplicateQuote(latestQuoteId, job.id);
    if (!dupRes.ok) {
      // Non fatal : la job est créée, on logue seulement
      console.error("[createJobOnExistingAddress] duplicateQuote:", dupRes.message);
    }
  }

  revalidatePath("/ventes/pipeline");
  revalidatePath("/clients");

  return {
    ok: true,
    jobId: job.id,
    installLat: addrRow.lat ?? null,
    installLng: addrRow.lng ?? null,
  };
}

/** Charge un job au format fiche prospect (modale d’édition). */
export async function getProspectJob(
  jobId: string
): Promise<{ ok: true; job: PipelineJob } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      `id, status, follow_up_flag, appointment_id, salesperson_id, salesperson_locked,
       installation_info, internal_notes, follow_up_date, created_at, installation_address_id,
       clients ( id, name, phone, email, city, billing_address, billing_city, billing_postal ),
       salespeople ( name ),
       installation_addresses!installation_address_id ( lat, lng, address_formatted, city )`
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: "Impossible de charger la fiche prospect." };
  }

  let appointmentDate: string | null = null;
  if (data.appointment_id) {
    const { data: appt } = await supabase
      .from("sales_appointments")
      .select("scheduled_date")
      .eq("id", data.appointment_id)
      .maybeSingle();
    appointmentDate = appt?.scheduled_date ?? null;
  }

  const { data: latestQuote, count } = await supabase
    .from("quotes")
    .select("quote_number", { count: "exact" })
    .eq("job_id", jobId)
    .order("quote_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const job: PipelineJob = {
    id: data.id,
    status: data.status as JobStatus,
    follow_up_flag: (data.follow_up_flag ?? null) as FollowUpFlag,
    appointment_id: data.appointment_id ?? null,
    appointment_date: appointmentDate,
    has_quote: (count ?? 0) > 0,
    quote_number: latestQuote?.quote_number ?? null,
    salesperson_id: data.salesperson_id,
    salesperson_locked: data.salesperson_locked ?? false,
    installation_info: data.installation_info,
    internal_notes: data.internal_notes,
    follow_up_date: data.follow_up_date,
    created_at: data.created_at,
    installation_address_id: data.installation_address_id ?? null,
    installation_address: unwrapRelation<PipelineInstallationAddress>(data.installation_addresses),
    clients: unwrapRelation<NonNullable<PipelineJob["clients"]>>(data.clients),
    salespeople: unwrapRelation<{ name: string }>(data.salespeople),
  };

  return { ok: true, job };
}
