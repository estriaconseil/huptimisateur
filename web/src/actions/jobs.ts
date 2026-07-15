"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";

export type JobFullDetail = {
  jobId: string;
  installationInfo: string | null;
  internalNotes: string | null;
  estimatedDurationHours: number;
  status: string;
  preferredDate: string | null;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  clientAddress: string | null;
  clientCity: string | null;
  clientPostal: string | null;
};

export async function getJobDetails(
  jobId: string
): Promise<{ ok: true; data: JobFullDetail } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("jobs")
    .select(
      `id, installation_info, internal_notes, estimated_duration_hours, status, preferred_date,
       clients ( name, phone, email, address_formatted, city, postal_code )`
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "Job introuvable" };
  }

  const row = data as {
    id: string;
    installation_info: string | null;
    internal_notes: string | null;
    estimated_duration_hours: number;
    status: string;
    preferred_date: string | null;
    clients: unknown;
  };

  const client = unwrapRelation<{
    name: string;
    phone: string | null;
    email: string | null;
    address_formatted: string | null;
    city: string | null;
    postal_code: string | null;
  }>(row.clients);

  return {
    ok: true,
    data: {
      jobId: row.id,
      installationInfo: row.installation_info,
      internalNotes: row.internal_notes,
      estimatedDurationHours: row.estimated_duration_hours,
      status: row.status,
      preferredDate: row.preferred_date,
      clientName: client?.name ?? "—",
      clientPhone: client?.phone ?? null,
      clientEmail: client?.email ?? null,
      clientAddress: client?.address_formatted ?? null,
      clientCity: client?.city ?? null,
      clientPostal: client?.postal_code ?? null,
    },
  };
}

export async function updateJobStatus(
  jobId: string,
  status: string,
  cancellation?: { reason: string; notes?: string }
) {
  const supabase = await createServerSupabaseClient();

  if (status === "soumission_repartie") {
    const { data: job } = await supabase
      .from("jobs")
      .select("appointment_id")
      .eq("id", jobId)
      .maybeSingle();
    if (!job?.appointment_id) {
      return {
        ok: false as const,
        message:
          "Impossible de passer en Visite planifiée sans rendez-vous. Utilisez « Trouver un créneau ».",
      };
    }
  }

  const payload: Record<string, unknown> = { status };
  if (status === "annule" && cancellation) {
    payload.cancellation_reason = cancellation.reason;
    payload.cancellation_notes = cancellation.notes ?? null;
  }

  const { error } = await supabase.from("jobs").update(payload).eq("id", jobId);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/dispatch");
  revalidatePath("/clients");
  revalidatePath("/a-planifier");
  revalidatePath("/ventes/pipeline");
  return { ok: true as const };
}

/** Met à jour uniquement le drapeau de suivi parallèle (follow_up_flag), sans changer le statut. */
export async function updateJobFlag(
  jobId: string,
  flag: "a_suivre" | "a_relancer" | "rdv_passe" | null
) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("jobs")
    .update({ follow_up_flag: flag })
    .eq("id", jobId);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/ventes/pipeline");
  return { ok: true as const };
}
