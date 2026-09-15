"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-role";
import { canTransition } from "@/lib/job-state-machine";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { EditClientFormValues, EditJobFormValues } from "@/lib/validations/client-job";
import type { Client, InstallationAddress, Job, JobStatus } from "@/types/domain";

// ── Types retour ─────────────────────────────────────────────────────────────

type Ok<T = void> = T extends void ? { ok: true } : { ok: true } & T;
type Err = { ok: false; message: string };

// ── searchClients ─────────────────────────────────────────────────────────────

export type ClientSearchResult = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_postal: string | null;
  installation_addresses: Array<{
    id: string;
    label: string | null;
    address_formatted: string | null;
    city: string | null;
    postal_code: string | null;
    lat: number | null;
    lng: number | null;
  }>;
  jobs: Array<{
    id: string;
    status: string;
    installation_address_id: string | null;
    quote_number: number | null;
  }>;
};

/** Mappe les lignes brutes Supabase en `ClientSearchResult[]`. */
function mapClientRows(data: unknown[]): ClientSearchResult[] {
  return data.map((r) => {
    const row = r as {
      id: string; name: string; phone: string | null; email: string | null;
      billing_address: string | null; billing_city: string | null; billing_postal: string | null;
      installation_addresses: unknown;
      jobs: unknown;
    };
    const addrs = (Array.isArray(row.installation_addresses)
      ? row.installation_addresses
      : row.installation_addresses ? [row.installation_addresses] : []) as ClientSearchResult["installation_addresses"];
    const rawJobs = Array.isArray(row.jobs) ? row.jobs : row.jobs ? [row.jobs] : [];
    const jobs = (rawJobs as Array<{ id: string; status: string; installation_address_id: string | null; quotes?: unknown }>)
      .map((j) => {
        const qRaw = j.quotes;
        const qList = Array.isArray(qRaw) ? qRaw : qRaw ? [qRaw] : [];
        const latest = [...qList].sort((a, b) =>
          ((b as { quote_number: number }).quote_number ?? 0) - ((a as { quote_number: number }).quote_number ?? 0)
        )[0] as { quote_number: number } | undefined;
        return {
          id: j.id,
          status: j.status,
          installation_address_id: j.installation_address_id,
          quote_number: latest?.quote_number ?? null,
        };
      });
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      billing_address: row.billing_address,
      billing_city: row.billing_city,
      billing_postal: row.billing_postal,
      installation_addresses: addrs,
      jobs,
    };
  });
}

const CLIENT_DETAIL_SELECT = `id, name, phone, email, billing_address, billing_city, billing_postal,
  installation_addresses ( id, label, address_formatted, city, postal_code, lat, lng ),
  jobs ( id, status, installation_address_id, quotes ( quote_number ) )`;

export async function searchClients(
  q: string,
  salespersonId?: string | null
): Promise<{ ok: true; data: ClientSearchResult[] } | Err> {
  const noSearch = q.trim().length < 2;

  // Sans recherche et sans filtre vendeur → rien
  if (noSearch && !salespersonId) return { ok: true as const, data: [] };

  const supabase = await createServerSupabaseClient();

  // Résoudre les client_ids du vendeur (si filtre vendeur)
  let vendeurClientIds: Set<string> | null = null;
  if (salespersonId) {
    const { data: spJobs } = await supabase
      .from("jobs")
      .select("client_id")
      .eq("salesperson_id", salespersonId);
    vendeurClientIds = new Set(
      (spJobs ?? []).map((j) => j.client_id as string).filter(Boolean)
    );
    if (vendeurClientIds.size === 0) return { ok: true as const, data: [] };
  }

  // Pas de recherche mais filtre vendeur → retourner tous leurs clients
  if (noSearch && vendeurClientIds) {
    const { data, error } = await supabase
      .from("clients")
      .select(CLIENT_DETAIL_SELECT)
      .in("id", [...vendeurClientIds].slice(0, 50))
      .order("name");
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, data: mapClientRows(data ?? []) };
  }

  // Recherche textuelle
  const safe = q.trim().replace(/[%_\\]/g, "\\$&");
  const pattern = `%${safe}%`;

  // Recherche en parallèle : clients (nom/tél/ville) + adresses d'installation
  const [clientsRes, addrsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id")
      .or(`name.ilike.${pattern},phone.ilike.${pattern},billing_city.ilike.${pattern}`)
      .limit(25),
    supabase
      .from("installation_addresses")
      .select("client_id")
      .ilike("address_formatted", pattern)
      .limit(25),
  ]);

  if (clientsRes.error) return { ok: false as const, message: clientsRes.error.message };

  // Union des client_ids trouvés
  let ids = new Set<string>([
    ...(clientsRes.data ?? []).map((r) => r.id),
    ...(addrsRes.data ?? []).map((r) => r.client_id),
  ]);

  // Si filtre vendeur, intersecter avec ses clients
  if (vendeurClientIds) {
    ids = new Set([...ids].filter((id) => vendeurClientIds!.has(id)));
  }

  if (ids.size === 0) return { ok: true as const, data: [] };

  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_DETAIL_SELECT)
    .in("id", [...ids].slice(0, 25))
    .order("name");

  if (error) return { ok: false as const, message: error.message };

  return { ok: true as const, data: mapClientRows(data ?? []) };
}

// ── reassignJobToClient ───────────────────────────────────────────────────────

export async function reassignJobToClient(
  jobId: string,
  newClientId: string,
  newInstallationAddressId?: string | null
): Promise<{ ok: true } | Err> {
  const supabase = await createServerSupabaseClient();

  const patch: Record<string, string | null> = { client_id: newClientId };
  if (newInstallationAddressId !== undefined) {
    patch.installation_address_id = newInstallationAddressId ?? null;
  }

  const { error } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", jobId);

  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/clients");
  revalidatePath("/ventes/pipeline");
  revalidatePath("/a-planifier");
  return { ok: true as const };
}

// ── Utilitaires ──────────────────────────────────────────────────────────────

function n(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

// ── updateClient ─────────────────────────────────────────────────────────────

export async function updateClient(
  clientId: string,
  data: EditClientFormValues
): Promise<{ ok: true } | Err> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("clients")
    .update({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      billing_address: data.billing_address || null,
      billing_city: data.billing_city || null,
      billing_postal: data.billing_postal || null,
    })
    .eq("id", clientId);

  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/clients");
  revalidatePath("/dispatch");
  revalidatePath("/ventes/pipeline");
  return { ok: true as const };
}

// ── addInstallationAddress ────────────────────────────────────────────────────

export async function addInstallationAddress(
  clientId: string,
  data: {
    label?: string | null;
    address_formatted?: string | null;
    city?: string | null;
    postal_code?: string | null;
    lat?: number | null;
    lng?: number | null;
    installation_info?: string | null;
  }
): Promise<{ ok: true; id: string } | Err> {
  const supabase = await createServerSupabaseClient();

  const { data: row, error } = await supabase
    .from("installation_addresses")
    .insert({
      client_id: clientId,
      label: n(data.label) ?? "Adresse",
      address_formatted: n(data.address_formatted),
      city: n(data.city),
      postal_code: n(data.postal_code),
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      installation_info: n(data.installation_info),
    })
    .select("id")
    .single();

  if (error || !row) return { ok: false as const, message: error?.message ?? "Erreur création adresse" };

  revalidatePath("/clients");
  return { ok: true as const, id: row.id };
}

// ── updateInstallationAddress ─────────────────────────────────────────────────

export async function updateInstallationAddress(
  addressId: string,
  data: {
    label?: string | null;
    address_formatted?: string | null;
    city?: string | null;
    postal_code?: string | null;
    lat?: number | null;
    lng?: number | null;
    installation_info?: string | null;
  }
): Promise<{ ok: true } | Err> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("installation_addresses")
    .update({
      label: n(data.label),
      address_formatted: n(data.address_formatted),
      city: n(data.city),
      postal_code: n(data.postal_code),
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      installation_info: n(data.installation_info),
    })
    .eq("id", addressId);

  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/clients");
  revalidatePath("/ventes/pipeline");
  revalidatePath("/dispatch");
  return { ok: true as const };
}

// ── getClientWithAddresses ────────────────────────────────────────────────────

export type ClientWithAddresses = Client & {
  installation_addresses: (InstallationAddress & { jobs: Pick<Job, "id" | "status" | "created_at">[] })[];
};

export async function getClientWithAddresses(
  clientId: string
): Promise<{ ok: true; data: ClientWithAddresses } | Err> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("clients")
    .select(
      `*, installation_addresses ( *, jobs ( id, status, created_at ) )`
    )
    .eq("id", clientId)
    .maybeSingle();

  if (error || !data) return { ok: false as const, message: error?.message ?? "Client introuvable" };

  return { ok: true as const, data: data as ClientWithAddresses };
}

export async function updateJob(
  jobId: string,
  data: EditJobFormValues
): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  const { data: current, error: currentErr } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();

  if (currentErr || !current) {
    return { ok: false as const, message: currentErr?.message ?? "Job introuvable" };
  }

  if (data.status !== current.status) {
    if (!canTransition(current.status as JobStatus, data.status as JobStatus)) {
      return {
        ok: false as const,
        message: `Transition invalide : ${current.status} → ${data.status}.`,
      };
    }
  }

  const spId = data.salesperson_id !== undefined ? (data.salesperson_id || null) : undefined;

  // Lock explicite via la fiche (checkbox). Si vendeur vidé → unlock forcé.
  let salespersonLockedUpdate: boolean | undefined;
  if (data.salesperson_locked !== undefined) {
    salespersonLockedUpdate = !!spId && data.salesperson_locked;
  } else if (spId === null || spId === "") {
    salespersonLockedUpdate = false;
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      status: data.status,
      estimated_duration_hours: data.estimated_duration_hours,
      preferred_date: data.preferred_date || null,
      follow_up_date: data.follow_up_date !== undefined ? (data.follow_up_date || null) : undefined,
      follow_up_flag: data.follow_up_flag !== undefined ? (data.follow_up_flag || null) : undefined,
      salesperson_id: spId,
      ...(salespersonLockedUpdate !== undefined
        ? { salesperson_locked: salespersonLockedUpdate }
        : {}),
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
