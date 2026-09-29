"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";
import { cityFromAddress } from "@/lib/address";
import { requireStaff, requireUser } from "@/lib/auth/require-role";
import { canTransition } from "@/lib/job-state-machine";
import { logActivity } from "@/actions/activity";
import type { JobStatus } from "@/types/domain";

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
  hasQuote: boolean;
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

  const { data: quoteRow } = await supabase
    .from("quotes")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

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
      clientCity: client?.city ?? cityFromAddress(client?.address_formatted) ?? null,
      clientPostal: client?.postal_code ?? null,
      hasQuote: !!quoteRow,
    },
  };
}

export async function updateJobStatus(
  jobId: string,
  status: string,
  cancellation?: { reason: string; notes?: string },
  options?: {
    /** Annule le RDV lié et efface appointment_id du job (ex: retour à Prospect). */
    cancelLinkedAppointment?: boolean;
  }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  // Lire le statut actuel pour valider la transition
  const { data: current } = await supabase
    .from("jobs")
    .select("status, appointment_id")
    .eq("id", jobId)
    .maybeSingle();

  if (current) {
    const from = current.status as JobStatus;
    const to = status as JobStatus;
    if (!canTransition(from, to)) {
      return {
        ok: false as const,
        message: `Transition invalide : ${from} → ${to}.`,
      };
    }
  }

  if (status === "soumission_repartie") {
    if (!current?.appointment_id) {
      return {
        ok: false as const,
        message:
          "Impossible de passer en Visite planifiée sans rendez-vous. Utilisez « Trouver un créneau ».",
      };
    }
  }

  const payload: Record<string, unknown> = { status };
  if (status === "annule") {
    if (cancellation) {
      payload.cancellation_reason = cancellation.reason;
      payload.cancellation_notes = cancellation.notes ?? null;
    }
    // Nettoyer les drapeaux de suivi — ils n'ont plus de sens sur un dossier annulé
    payload.follow_up_flag = null;
    payload.follow_up_date = null;
  }

  const { error } = await supabase.from("jobs").update(payload).eq("id", jobId);
  if (error) return { ok: false as const, message: error.message };

  // Annuler le RDV lié si demandé (retour à Prospect / Va nous rappeler depuis Visite planifiée)
  const appointmentId = current?.appointment_id ?? null;
  if (options?.cancelLinkedAppointment && appointmentId) {
    await supabase
      .from("sales_appointments")
      .update({ status: "cancelled" })
      .eq("id", appointmentId);

    await supabase
      .from("jobs")
      .update({ appointment_id: null })
      .eq("id", jobId);

    await logActivity(jobId, "appointment_cancelled", { appointment_id: appointmentId });
  }

  // Lors d'une annulation : toujours annuler le RDV lié et marquer la soumission comme refusée
  if (status === "annule") {
    if (appointmentId && !options?.cancelLinkedAppointment) {
      await supabase
        .from("sales_appointments")
        .update({ status: "cancelled" })
        .eq("id", appointmentId);
      await supabase
        .from("jobs")
        .update({ appointment_id: null })
        .eq("id", jobId);
      await logActivity(jobId, "appointment_cancelled", { appointment_id: appointmentId });
    }
    // Passer la soumission liée en « refusée » si elle était draft ou en attente
    await supabase
      .from("quotes")
      .update({ status: "refused" })
      .eq("job_id", jobId)
      .in("status", ["draft", "pending"]);
  }

  // Journal d'activité
  await logActivity(jobId, "status_changed", {
    from: current?.status ?? "inconnu",
    to: status,
    ...(status === "annule" && cancellation ? { reason: cancellation.reason } : {}),
  });

  revalidatePath("/dispatch");
  revalidatePath("/clients");
  revalidatePath("/a-planifier");
  revalidatePath("/ventes/pipeline");
  revalidatePath("/ventes");
  return { ok: true as const };
}

/**
 * Accepte la soumission liée à un job `en_attente` et le passe en `a_planifier`.
 * Raccourci pipeline : évite d'ouvrir la page soumission pour un cas simple.
 */
export async function acceptJobAsPlanifier(
  jobId: string
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("status, appointment_id")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) return { ok: false, message: "Job introuvable." };
  if (!canTransition(job.status as JobStatus, "a_planifier")) {
    return { ok: false, message: `Transition invalide depuis ${job.status}.` };
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "a_planifier", follow_up_flag: null })
    .eq("id", jobId);

  if (error) return { ok: false, message: error.message };

  // Accepter aussi la soumission liée si elle existe
  await supabase
    .from("quotes")
    .update({ status: "accepted" })
    .eq("job_id", jobId)
    .eq("status", "pending");

  await logActivity(jobId, "status_changed", { from: job.status, to: "a_planifier" });

  revalidatePath("/ventes/pipeline");
  revalidatePath("/a-planifier");
  return { ok: true, message: "Job transféré en installation." };
}

/** Met à jour uniquement le drapeau de suivi parallèle (follow_up_flag), sans changer le statut. */
export async function updateJobFlag(
  jobId: string,
  flag: "a_suivre" | "a_relancer" | "rdv_passe" | null
) {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("jobs")
    .update({ follow_up_flag: flag })
    .eq("id", jobId);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/ventes/pipeline");
  return { ok: true as const };
}
