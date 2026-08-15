"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { EditClientFormValues, EditJobFormValues } from "@/lib/validations/client-job";
import type { Client, InstallationAddress, Job } from "@/types/domain";

// ── Types retour ─────────────────────────────────────────────────────────────

type Ok<T = void> = T extends void ? { ok: true } : { ok: true } & T;
type Err = { ok: false; message: string };

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
  const supabase = await createServerSupabaseClient();

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
