"use server";

import { addDays, format, getISODay, parse } from "date-fns";
import { fr } from "date-fns/locale";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";
import { fetchDrivingMetricsFromOrigin } from "@/lib/maps/distance-matrix";
import { FIXED_TIME_SLOTS } from "@/features/sales/sales-utils";
import type { AppointmentStatus, QuoteStatus } from "@/types/domain";

/** Statuts ventes avant « En attente » — seuls ceux-ci peuvent être promus. */
const PRE_EN_ATTENTE = ["soumission_en_attente", "soumission_repartie"] as const;

/**
 * Si la soumission a un sous-total > 0, passe le job lié en « en_attente ».
 * Ne rétrograde jamais et n'écrase pas un statut d'installation.
 */
async function promoteJobToEnAttenteIfPriced(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string | null | undefined,
  subtotal: number
): Promise<void> {
  if (!jobId || !(subtotal > 0)) return;
  await supabase
    .from("jobs")
    .update({ status: "en_attente" })
    .eq("id", jobId)
    .in("status", [...PRE_EN_ATTENTE]);
}

// ── Types ────────────────────────────────────────────────────────────────────

export type CreateAppointmentInput = {
  salesperson_id: string;
  client_name: string;
  client_phone?: string | null;
  client_email?: string | null;
  client_address?: string | null;
  client_lat?: number | null;
  client_lng?: number | null;
  scheduled_date: string;
  start_time: string;
  notes?: string | null;
};

export type UnitInput = {
  unit_order: number;
  description: string;
  brand: string;
  model: string;
  capacity_btu: string;
  heating_capacity_25: string;
  warranty_parts: string;
  warranty_months: string;
  evaporator: string;
  pipe_feet: string;
  cap_long1_length: string;
  cap_long1_color: string;
  cap_long2_length: string;
  cap_long2_color: string;
  support_type: string;
  floor_mount_type: string;
  difficulty: string;
  tech_count: number | null;
  unit_subtotal: number;
  serial_number: string | null;
};

export type QuoteInput = {
  quote_number: number;
  client_name: string;
  client_address: string;
  client_work_address: string;
  client_phone: string;
  client_cell: string;
  client_email: string;
  has_subsidy: boolean;
  will_call_back: boolean;
  montant_subvention: number | null;
  total_net: number | null;
  quote_date: string;
  inst_prepiping: boolean;
  inst_drill_concrete: boolean;
  inst_through_attic: boolean;
  inst_through_basement: boolean;
  inst_through_garage: boolean;
  inst_through_closet: boolean;
  inst_appliance_change: boolean;
  inst_through_stairs: boolean;
  electrical_amperage: string;
  electrical_panel: string;
  electrical_included: boolean;
  electrical_not_included: boolean;
  electrical_to_schedule: boolean;
  electrical_initials: string;
  notes: string;
  subtotal: number;
  deposit: number | null;
  estimated_duration_hours: 4 | 8 | null;
  salesperson_id: string;
  approved_by: string;
  signature_data: string | null;
  status: QuoteStatus;
};

type Ok<T = undefined> = T extends undefined ? { ok: true } : { ok: true } & T;
type Err = { ok: false; message: string };

// ── Rendez-vous ──────────────────────────────────────────────────────────────

export async function createAppointment(
  data: CreateAppointmentInput
): Promise<{ ok: true; id: string } | Err> {
  const supabase = await createServerSupabaseClient();
  const { data: appt, error } = await supabase
    .from("sales_appointments")
    .insert({
      salesperson_id: data.salesperson_id,
      client_name: data.client_name,
      client_phone: data.client_phone || null,
      client_email: data.client_email || null,
      client_address: data.client_address || null,
      client_lat: data.client_lat ?? null,
      client_lng: data.client_lng ?? null,
      scheduled_date: data.scheduled_date,
      start_time: data.start_time,
      notes: data.notes || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Ce créneau vient d'être réservé par quelqu'un d'autre. Veuillez en choisir un autre." };
    }
    return { ok: false, message: error.message };
  }
  revalidatePath("/ventes");
  return { ok: true, id: appt.id };
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus
): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("sales_appointments")
    .update({ status })
    .eq("id", id);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/ventes");
  revalidatePath(`/ventes/rdv/${id}`);
  return { ok: true };
}

/**
 * Déplace un rendez-vous vers un nouveau créneau / vendeur.
 */
export async function moveAppointment(
  appointmentId: string,
  newSalespersonId: string,
  newDate: string,
  newTime: string
): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non authentifié" };

  const { error } = await supabase
    .from("sales_appointments")
    .update({
      salesperson_id: newSalespersonId,
      scheduled_date: newDate,
      start_time: newTime,
    })
    .eq("id", appointmentId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/ventes");
  return { ok: true };
}

/**
 * Annule un rendez-vous (créneau libéré) et remet le job lié en Prospect.
 */
export async function cancelAppointment(appointmentId: string): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non authentifié" };

  const { error } = await supabase
    .from("sales_appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId);

  if (error) return { ok: false, message: error.message };

  // Job lié → Prospect, créneau libéré
  await supabase
    .from("jobs")
    .update({ status: "soumission_en_attente", appointment_id: null, follow_up_flag: null })
    .eq("appointment_id", appointmentId)
    .in("status", ["soumission_repartie", "soumission_en_attente", "en_attente"]);

  revalidatePath("/ventes");
  revalidatePath("/ventes/pipeline");
  return { ok: true };
}

export async function deleteAppointment(id: string): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("sales_appointments")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/ventes");
  return { ok: true };
}

// ── Soumissions ──────────────────────────────────────────────────────────────

export async function createQuote(
  link: { appointmentId?: string | null; jobId?: string | null },
  data: QuoteInput,
  units: UnitInput[]
): Promise<{ ok: true; id: string } | Err> {
  const supabase = await createServerSupabaseClient();
  const appointmentId = link.appointmentId ?? null;
  let jobId = link.jobId ?? null;
  let clientId: string | null = null;

  // Résoudre job + client depuis le RDV ou le job fourni
  if (jobId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("id, client_id, appointment_id")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return { ok: false, message: "Job introuvable" };
    clientId = job.client_id;
    if (!appointmentId && job.appointment_id) {
      // garder null si création volontaire sans RDV — on n'écrase pas
    }
  } else if (appointmentId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("id, client_id")
      .eq("appointment_id", appointmentId)
      .maybeSingle();
    if (job) {
      jobId = job.id;
      clientId = job.client_id;
    }
  }

  if (!appointmentId && !jobId) {
    return { ok: false, message: "Un rendez-vous ou un job est requis pour créer une soumission." };
  }

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .insert({
      quote_number: data.quote_number,
      appointment_id: appointmentId,
      job_id: jobId,
      client_id: clientId,
      client_name: data.client_name,
      client_address: data.client_address || null,
      client_work_address: data.client_work_address || null,
      client_phone: data.client_phone || null,
      client_cell: data.client_cell || null,
      client_email: data.client_email || null,
      has_subsidy: data.has_subsidy,
      will_call_back: data.will_call_back,
      montant_subvention: data.montant_subvention,
      total_net: data.total_net,
      quote_date: data.quote_date,
      inst_prepiping: data.inst_prepiping,
      inst_drill_concrete: data.inst_drill_concrete,
      inst_through_attic: data.inst_through_attic,
      inst_through_basement: data.inst_through_basement,
      inst_through_garage: data.inst_through_garage,
      inst_through_closet: data.inst_through_closet,
      inst_appliance_change: data.inst_appliance_change,
      inst_through_stairs: data.inst_through_stairs,
      electrical_amperage: data.electrical_amperage || null,
      electrical_panel: data.electrical_panel || null,
      electrical_included: data.electrical_included,
      electrical_not_included: data.electrical_not_included,
      electrical_to_schedule: data.electrical_to_schedule,
      electrical_initials: data.electrical_initials || null,
      notes: data.notes || null,
      subtotal: data.subtotal,
      deposit: data.deposit,
      estimated_duration_hours: data.estimated_duration_hours,
      salesperson_id: data.salesperson_id || null,
      approved_by: data.approved_by || null,
      signature_data: data.signature_data,
      status: data.status,
    })
    .select("id")
    .single();

  if (qErr) return { ok: false, message: qErr.message };

  if (units.length > 0) {
    const { error: uErr } = await supabase.from("quote_units").insert(
      units.map((u) => ({
        quote_id: quote.id,
        unit_order: u.unit_order,
        description: u.description || null,
        brand: u.brand || null,
        model: u.model || null,
        capacity_btu: u.capacity_btu || null,
        heating_capacity_25: u.heating_capacity_25 || null,
        warranty_parts: u.warranty_parts || null,
        warranty_months: u.warranty_months || null,
        evaporator: u.evaporator || null,
        pipe_feet: u.pipe_feet || null,
        cap_long1_length: u.cap_long1_length || null,
        cap_long1_color: u.cap_long1_color || null,
        cap_long2_length: u.cap_long2_length || null,
        cap_long2_color: u.cap_long2_color || null,
        support_type: u.support_type || null,
        floor_mount_type: u.floor_mount_type || null,
        difficulty: u.difficulty || null,
        tech_count: u.tech_count,
        unit_subtotal: u.unit_subtotal,
        serial_number: u.serial_number || null,
      }))
    );
    if (uErr) return { ok: false, message: uErr.message };
  }

  // Lier le rendez-vous à cette soumission (si applicable)
  if (appointmentId) {
    const { error: linkErr } = await supabase
      .from("sales_appointments")
      .update({ quote_id: quote.id })
      .eq("id", appointmentId);

    if (linkErr) return { ok: false, message: `Soumission créée mais lien RDV échoué : ${linkErr.message}` };
  }

  await promoteJobToEnAttenteIfPriced(supabase, jobId, data.subtotal);

  revalidatePath("/ventes");
  revalidatePath("/ventes/soumissions");
  revalidatePath("/ventes/pipeline");
  if (appointmentId) revalidatePath(`/ventes/rdv/${appointmentId}`);
  if (jobId) revalidatePath(`/ventes/soumission/${jobId}`);
  return { ok: true, id: quote.id };
}

export async function updateQuote(
  quoteId: string,
  data: QuoteInput,
  units: UnitInput[]
): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();

  const { error: qErr } = await supabase
    .from("quotes")
    .update({
      quote_number: data.quote_number,
      client_name: data.client_name,
      client_address: data.client_address || null,
      client_work_address: data.client_work_address || null,
      client_phone: data.client_phone || null,
      client_cell: data.client_cell || null,
      client_email: data.client_email || null,
      has_subsidy: data.has_subsidy,
      will_call_back: data.will_call_back,
      montant_subvention: data.montant_subvention,
      total_net: data.total_net,
      quote_date: data.quote_date,
      inst_prepiping: data.inst_prepiping,
      inst_drill_concrete: data.inst_drill_concrete,
      inst_through_attic: data.inst_through_attic,
      inst_through_basement: data.inst_through_basement,
      inst_through_garage: data.inst_through_garage,
      inst_through_closet: data.inst_through_closet,
      inst_appliance_change: data.inst_appliance_change,
      inst_through_stairs: data.inst_through_stairs,
      electrical_amperage: data.electrical_amperage || null,
      electrical_panel: data.electrical_panel || null,
      electrical_included: data.electrical_included,
      electrical_not_included: data.electrical_not_included,
      electrical_to_schedule: data.electrical_to_schedule,
      electrical_initials: data.electrical_initials || null,
      notes: data.notes || null,
      subtotal: data.subtotal,
      deposit: data.deposit,
      estimated_duration_hours: data.estimated_duration_hours,
      salesperson_id: data.salesperson_id || null,
      approved_by: data.approved_by || null,
      signature_data: data.signature_data,
      status: data.status,
    })
    .eq("id", quoteId);

  if (qErr) return { ok: false, message: qErr.message };

  // Remplacer toutes les unités
  const { error: deleteUnitsErr } = await supabase.from("quote_units").delete().eq("quote_id", quoteId);
  if (deleteUnitsErr) return { ok: false, message: `Échec de la suppression des unités existantes : ${deleteUnitsErr.message}` };

  if (units.length > 0) {
    const { error: uErr } = await supabase.from("quote_units").insert(
      units.map((u) => ({
        quote_id: quoteId,
        unit_order: u.unit_order,
        description: u.description || null,
        brand: u.brand || null,
        model: u.model || null,
        capacity_btu: u.capacity_btu || null,
        heating_capacity_25: u.heating_capacity_25 || null,
        warranty_parts: u.warranty_parts || null,
        warranty_months: u.warranty_months || null,
        evaporator: u.evaporator || null,
        pipe_feet: u.pipe_feet || null,
        cap_long1_length: u.cap_long1_length || null,
        cap_long1_color: u.cap_long1_color || null,
        cap_long2_length: u.cap_long2_length || null,
        cap_long2_color: u.cap_long2_color || null,
        support_type: u.support_type || null,
        floor_mount_type: u.floor_mount_type || null,
        difficulty: u.difficulty || null,
        tech_count: u.tech_count,
        unit_subtotal: u.unit_subtotal,
        serial_number: u.serial_number || null,
      }))
    );
    if (uErr) return { ok: false, message: uErr.message };
  }

  // Résoudre job lié pour promotion éventuelle
  const { data: quoteRow } = await supabase
    .from("quotes")
    .select("job_id, appointment_id")
    .eq("id", quoteId)
    .maybeSingle();

  let promoteJobId = quoteRow?.job_id ?? null;
  if (!promoteJobId && quoteRow?.appointment_id) {
    const { data: jobByAppt } = await supabase
      .from("jobs")
      .select("id")
      .eq("appointment_id", quoteRow.appointment_id)
      .maybeSingle();
    promoteJobId = jobByAppt?.id ?? null;
  }
  await promoteJobToEnAttenteIfPriced(supabase, promoteJobId, data.subtotal);

  revalidatePath("/ventes");
  revalidatePath("/ventes/soumissions");
  revalidatePath("/ventes/pipeline");
  if (promoteJobId) revalidatePath(`/ventes/soumission/${promoteJobId}`);
  return { ok: true };
}

export async function updateQuoteStatus(
  quoteId: string,
  status: QuoteStatus
): Promise<Ok | Err> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("quotes")
    .update({ status })
    .eq("id", quoteId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/ventes");
  return { ok: true };
}

/** Convertit une soumission en job d'installation (réutilise le job prospect si lié). */
export async function convertQuoteToInstallationJob(
  quoteId: string,
  options?: {
    estimatedDurationHours?: 4 | 8;
    cancelSalesAppointment?: boolean;
  }
): Promise<{ ok: true; jobId: string } | Err> {
  const supabase = await createServerSupabaseClient();

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("*, quote_units(*)")
    .eq("id", quoteId)
    .single();

  if (qErr || !quote) return { ok: false, message: qErr?.message ?? "Soumission introuvable" };

  const duration =
    options?.estimatedDurationHours ??
    (quote.estimated_duration_hours === 4 || quote.estimated_duration_hours === 8
      ? (quote.estimated_duration_hours as 4 | 8)
      : null);

  if (!duration) {
    return { ok: false, message: "Durée des travaux requise (demi-journée ou journée complète)." };
  }

  const INSTALL_STATUSES = ["a_planifier", "reparti", "retour_a_faire", "facturation", "complete", "termine"];

  // Résoudre le job lié (colonne job_id, sinon via appointment_id)
  let linkedJobId: string | null = quote.job_id ?? null;
  if (!linkedJobId && quote.appointment_id) {
    const { data: jobByAppt } = await supabase
      .from("jobs")
      .select("id")
      .eq("appointment_id", quote.appointment_id)
      .maybeSingle();
    linkedJobId = jobByAppt?.id ?? null;
  }

  // Cas principal : réutiliser le job prospect déjà lié
  if (linkedJobId) {
    const { data: existingJob, error: jobReadErr } = await supabase
      .from("jobs")
      .select("id, status, installation_info, appointment_id")
      .eq("id", linkedJobId)
      .maybeSingle();

    if (jobReadErr) return { ok: false, message: jobReadErr.message };
    if (!existingJob) return { ok: false, message: "Job lié à la soumission introuvable" };

    if (INSTALL_STATUSES.includes(existingJob.status)) {
      return { ok: false, message: "Cette soumission a déjà été convertie en job d'installation." };
    }

    const appointmentIdToCancel =
      options?.cancelSalesAppointment
        ? (existingJob.appointment_id ?? quote.appointment_id ?? null)
        : null;

    const { error: jobUpdErr } = await supabase
      .from("jobs")
      .update({
        status: "a_planifier",
        estimated_duration_hours: duration,
        installation_info: quote.notes || existingJob.installation_info,
        internal_notes: `Soumission #${quote.quote_number}`,
        follow_up_flag: null,
        ...(appointmentIdToCancel ? { appointment_id: null } : {}),
      })
      .eq("id", existingJob.id);

    if (jobUpdErr) return { ok: false, message: jobUpdErr.message };

    const { error: quoteUpdErr } = await supabase
      .from("quotes")
      .update({
        job_id: existingJob.id,
        status: "accepted",
        estimated_duration_hours: duration,
      })
      .eq("id", quoteId);

    if (quoteUpdErr) {
      return { ok: false, message: `Job mis à jour mais soumission non acceptée : ${quoteUpdErr.message}` };
    }

    if (appointmentIdToCancel) {
      // Supprimer le RDV (ON DELETE SET NULL sur quotes/jobs) → créneau vraiment libre
      await supabase.from("sales_appointments").delete().eq("id", appointmentIdToCancel);
    }

    revalidatePath("/ventes");
    revalidatePath("/ventes/soumissions");
    revalidatePath("/ventes/pipeline");
    revalidatePath("/dispatch");
    revalidatePath("/a-planifier");
    revalidatePath("/clients");
    return { ok: true, jobId: existingJob.id };
  }

  // Fallback : soumission sans job lié (données legacy) → créer client + job
  const { data: client, error: cErr } = await supabase
    .from("clients")
    .insert({
      name: quote.client_name,
      phone: quote.client_phone,
      email: quote.client_email,
      address_formatted: quote.client_address,
    })
    .select("id")
    .single();

  if (cErr) return { ok: false, message: cErr.message };

  const { data: job, error: jErr } = await supabase
    .from("jobs")
    .insert({
      client_id: client.id,
      installation_info: quote.notes,
      internal_notes: `Soumission #${quote.quote_number}`,
      estimated_duration_hours: duration,
      status: "a_planifier",
    })
    .select("id")
    .single();

  if (jErr) return { ok: false, message: jErr.message };

  const { error: quoteLinkErr } = await supabase
    .from("quotes")
    .update({
      job_id: job.id,
      client_id: client.id,
      status: "accepted",
      estimated_duration_hours: duration,
    })
    .eq("id", quoteId);

  if (quoteLinkErr) {
    return { ok: false, message: `Job créée mais lien soumission échoué : ${quoteLinkErr.message}` };
  }

  if (options?.cancelSalesAppointment && quote.appointment_id) {
    await supabase.from("sales_appointments").delete().eq("id", quote.appointment_id);
  }

  revalidatePath("/ventes");
  revalidatePath("/ventes/soumissions");
  revalidatePath("/dispatch");
  revalidatePath("/a-planifier");
  revalidatePath("/clients");
  return { ok: true, jobId: job.id };
}

/** Récupère le prochain numéro de soumission (max existant + 1, min 30001) */
export async function getNextQuoteNumber(): Promise<number> {
  const supabase = await createServerSupabaseClient();
  // nextval() via RPC : réserve atomiquement un numéro unique (même si deux vendeurs
  // ouvrent la page simultanément). Le numéro est affiché en lecture seule → papier = web.
  const { data, error } = await supabase.rpc("get_next_quote_number");
  if (error || !data) {
    // Fallback défensif : MAX + 1 si la fonction RPC n'existe pas encore
    const { data: fallback } = await supabase
      .from("quotes")
      .select("quote_number")
      .order("quote_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    return fallback ? (fallback.quote_number as number) + 1 : 30001;
  }
  return data as number;
}

/** Trouve le prochain créneau disponible pour un vendeur (respecte les horaires par jour) */
export async function findNextAvailableSlot(
  salespersonId: string
): Promise<{ date: string; start_time: string; dateFormatted: string } | null> {
  const supabase = await createServerSupabaseClient();

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const in60Days = format(addDays(today, 60), "yyyy-MM-dd");

  const [{ data: appointments }, { data: dayConfigs }] = await Promise.all([
    supabase
      .from("sales_appointments")
      .select("scheduled_date, start_time")
      .eq("salesperson_id", salespersonId)
      .neq("status", "cancelled")
      .gte("scheduled_date", todayStr)
      .lte("scheduled_date", in60Days),
    supabase
      .from("salesperson_day_config")
      .select("day_of_week, active, work_start_time, work_end_time")
      .eq("salesperson_id", salespersonId),
  ]);

  const occupied = new Set(
    (appointments ?? []).map(
      (a) => `${a.scheduled_date}|${(a.start_time as string).slice(0, 5)}`
    )
  );

  const configByDow = new Map(
    (dayConfigs ?? []).map((c) => [c.day_of_week as number, c])
  );

  const base = new Date(2000, 0, 1);

  for (let offset = 0; offset <= 60; offset++) {
    const date = addDays(today, offset);
    const dow = getISODay(date); // 1=Lun…7=Dim
    const cfg = configByDow.get(dow);
    if (!cfg || !cfg.active) continue;

    const dateStr = format(date, "yyyy-MM-dd");
    const startTime = parse((cfg.work_start_time as string).slice(0, 5), "HH:mm", base);
    const endTime   = parse((cfg.work_end_time   as string).slice(0, 5), "HH:mm", base);

    for (const slot of FIXED_TIME_SLOTS) {
      const slotTime = parse(slot, "HH:mm", base);
      if (slotTime < startTime || slotTime >= endTime) continue;
      if (!occupied.has(`${dateStr}|${slot}`)) {
        return {
          date: dateStr,
          start_time: slot,
          dateFormatted: format(date, "d MMM yyyy"),
        };
      }
    }
  }
  return null;
}

/**
 * Réserve directement un créneau pour un prospect existant (job).
 * Crée le rendez-vous avec les données du client et passe le job en "soumission_en_attente".
 */
export async function bookProspectToSlot(input: {
  jobId: string;
  salespersonId: string;
  scheduledDate: string;
  startTime: string;
}): Promise<{ ok: true; appointmentId: string } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non authentifié" };

  // Récupérer les infos du client via la job
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(`id, status, appointment_id, clients ( name, phone, email, address_formatted, lat, lng )`)
    .eq("id", input.jobId)
    .maybeSingle();

  if (jobErr || !job) return { ok: false, message: jobErr?.message ?? "Job introuvable" };

  const client = unwrapRelation<{
    name: string; phone: string | null; email: string | null;
    address_formatted: string | null; lat: number | null; lng: number | null;
  }>((job as { clients: unknown }).clients);

  if (!client) return { ok: false, message: "Client introuvable" };

  // Remplacement : libérer l'ancien RDV s'il existe
  const previousApptId = (job as { appointment_id: string | null }).appointment_id;
  if (previousApptId) {
    await supabase.from("sales_appointments").delete().eq("id", previousApptId);
  }

  // Créer le rendez-vous
  const { data: appt, error: apptErr } = await supabase
    .from("sales_appointments")
    .insert({
      salesperson_id: input.salespersonId,
      client_name: client.name,
      client_phone: client.phone ?? null,
      client_address: client.address_formatted ?? null,
      client_lat: client.lat ?? null,
      client_lng: client.lng ?? null,
      scheduled_date: input.scheduledDate,
      start_time: input.startTime,
      status: "scheduled",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (apptErr) return { ok: false, message: apptErr.message };

  // Passer la job en "soumission_repartie" et lier le rendez-vous
  const { error: jobStatusErr } = await supabase
    .from("jobs")
    .update({
      status: "soumission_repartie",
      salesperson_id: input.salespersonId,
      appointment_id: appt.id,
      follow_up_flag: null,
    })
    .eq("id", input.jobId);

  if (jobStatusErr) return { ok: false, message: `RDV créé mais statut du prospect non mis à jour : ${jobStatusErr.message}` };

  revalidatePath("/ventes");
  revalidatePath("/ventes/pipeline");
  return { ok: true, appointmentId: appt.id };
}

export type SlotSuggestion = {
  salesperson_id: string;
  salesperson_name: string;
  date: string;
  start_time: string;
  dateFormatted: string;
};

/** Trouve le prochain créneau disponible pour TOUS les vendeurs actifs */
export async function findNextSlotAllSalespeople(): Promise<SlotSuggestion[]> {
  const supabase = await createServerSupabaseClient();

  const { data: salespeople } = await supabase
    .from("salespeople")
    .select(`id, name, salesperson_day_config ( day_of_week, active, work_start_time, work_end_time )`)
    .eq("active", true)
    .order("name");

  if (!salespeople?.length) return [];

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const in60Days = format(addDays(today, 60), "yyyy-MM-dd");

  const { data: allAppts } = await supabase
    .from("sales_appointments")
    .select("salesperson_id, scheduled_date, start_time")
    .neq("status", "cancelled")
    .gte("scheduled_date", todayStr)
    .lte("scheduled_date", in60Days);

  const results: SlotSuggestion[] = [];
  const base = new Date(2000, 0, 1);

  for (const sp of salespeople) {
    const occupied = new Set(
      (allAppts ?? [])
        .filter((a) => a.salesperson_id === sp.id)
        .map((a) => `${a.scheduled_date}|${(a.start_time as string).slice(0, 5)}`)
    );

    const configs = (sp.salesperson_day_config as { day_of_week: number; active: boolean; work_start_time: string; work_end_time: string }[]) ?? [];
    const configByDow = new Map(configs.map((c) => [c.day_of_week, c]));

    for (let offset = 0; offset <= 60; offset++) {
      const date = addDays(today, offset);
      const dow = getISODay(date);
      const cfg = configByDow.get(dow);
      if (!cfg || !cfg.active) continue;

      const dateStr = format(date, "yyyy-MM-dd");
      const startTime = parse(cfg.work_start_time.slice(0, 5), "HH:mm", base);
      const endTime = parse(cfg.work_end_time.slice(0, 5), "HH:mm", base);

      for (const slot of FIXED_TIME_SLOTS) {
        const slotTime = parse(slot, "HH:mm", base);
        if (slotTime < startTime || slotTime >= endTime) continue;
        if (!occupied.has(`${dateStr}|${slot}`)) {
          results.push({
            salesperson_id: sp.id,
            salesperson_name: sp.name,
            date: dateStr,
            start_time: slot,
            dateFormatted: format(date, "EEEE d MMM", { locale: fr }),
          });
          break; // Un seul créneau par vendeur
        }
      }
      if (results.find((r) => r.salesperson_id === sp.id)) break;
    }
  }

  // Trier par date, puis heure
  return results.sort((a, b) =>
    a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date)
  );
}

// ── Sens B : meilleurs créneaux pour un prospect ──────────────────────────────

export type ProspectSlotResult = {
  salesperson_id: string;
  salesperson_name: string;
  date: string;
  start_time: string;
  dateFormatted: string;
  /** Temps de trajet score en secondes (moyenne prev/next si les deux). null si pas de GPS. */
  travel_seconds: number | null;
  /** Contexte prev/next pour info */
  context: string;
};

/**
 * Score trajet (secondes) :
 * - prev = RDV avant le créneau, sinon domicile vendeur (1er de la journée)
 * - next = RDV après le créneau (sinon ignoré)
 * - si prev et next → moyenne ; sinon le seul disponible
 */
function scoreTravelSeconds(
  tPrev: number | null,
  tNext: number | null
): number {
  if (tPrev !== null && tNext !== null) return (tPrev + tNext) / 2;
  if (tPrev !== null) return tPrev;
  if (tNext !== null) return tNext;
  return Infinity;
}

/**
 * Trouve et classe les meilleurs créneaux disponibles pour un prospect donné (lat/lng).
 * Score en minutes de trajet (Distance Matrix duration).
 * `excludeAppointmentId` : ignore ce RDV (re-optimisation d'un dossier déjà booké).
 */
export async function findBestSlotsForProspect(
  prospectLat: number,
  prospectLng: number,
  maxResults = 10,
  salespersonId?: string | null,
  excludeAppointmentId?: string | null
): Promise<{ ok: true; slots: ProspectSlotResult[] } | { ok: false; message: string }> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { ok: false, message: "Clé Google Maps manquante" };

  const supabase = await createServerSupabaseClient();
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const in30Days = format(addDays(today, 30), "yyyy-MM-dd");

  // 1. Vendeurs actifs + horaires + domicile (filtrés si vendeur assigné)
  let spQuery = supabase
    .from("salespeople")
    .select(`id, name, home_lat, home_lng, home_address,
             salesperson_day_config ( day_of_week, active, work_start_time, work_end_time )`)
    .eq("active", true)
    .order("name");

  if (salespersonId) {
    spQuery = spQuery.eq("id", salespersonId);
  }

  const { data: salespeople } = await spQuery;

  if (!salespeople?.length) return { ok: true, slots: [] };

  // 2. Tous les RDV dans la fenêtre (avec coordonnées), hors annulés et hors RDV exclu
  let apptQuery = supabase
    .from("sales_appointments")
    .select("id, salesperson_id, scheduled_date, start_time, client_name, client_address, client_lat, client_lng")
    .neq("status", "cancelled")
    .gte("scheduled_date", todayStr)
    .lte("scheduled_date", in30Days)
    .order("scheduled_date")
    .order("start_time");

  const { data: rawAppts } = await apptQuery;
  const allAppts = (rawAppts ?? []).filter(
    (a) => !excludeAppointmentId || a.id !== excludeAppointmentId
  );

  const base = new Date(2000, 0, 1);

  // 3. Collecter toutes les positions uniques à géocoder
  type Position = { lat: number; lng: number; label: string };
  const positions: Position[] = [];
  const posKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const posMap = new Map<string, number>(); // key → index in positions[]

  const addPos = (lat: number | null, lng: number | null, label: string): number => {
    if (!lat || !lng) return -1;
    const key = posKey(lat, lng);
    if (posMap.has(key)) return posMap.get(key)!;
    const idx = positions.length;
    positions.push({ lat, lng, label });
    posMap.set(key, idx);
    return idx;
  };

  // Domiciles des vendeurs
  for (const sp of salespeople) {
    addPos(sp.home_lat as number | null, sp.home_lng as number | null, `Domicile ${sp.name}`);
  }
  // Adresses des RDV
  for (const a of allAppts) {
    addPos(a.client_lat as number | null, a.client_lng as number | null, a.client_name ?? "");
  }

  // 4. Appel Distance Matrix : prospect → toutes les positions (durée en secondes)
  type SecCache = Map<number, number | null>;
  const secCache: SecCache = new Map();

  if (positions.length > 0) {
    const metrics = await fetchDrivingMetricsFromOrigin(
      apiKey,
      { lat: prospectLat, lng: prospectLng },
      positions.map((p) => ({ lat: p.lat, lng: p.lng }))
    );
    metrics.forEach((m, i) => {
      secCache.set(i, m.seconds);
    });
  }

  const getSec = (posIdx: number): number | null => {
    if (posIdx < 0) return null;
    return secCache.get(posIdx) ?? null;
  };

  type ApptRow = (typeof allAppts)[number];
  const apptsFor = (spId: string, date: string): ApptRow[] =>
    allAppts.filter((a) => a.salesperson_id === spId && a.scheduled_date === date);

  // 5. Construire et scorer chaque créneau disponible
  type ScoredSlot = ProspectSlotResult & { score: number };
  const scored: ScoredSlot[] = [];

  for (const sp of salespeople) {
    const spConfigs = (sp.salesperson_day_config as {
      day_of_week: number; active: boolean; work_start_time: string; work_end_time: string;
    }[]) ?? [];
    const configByDow = new Map(spConfigs.map((c) => [c.day_of_week, c]));

    const homeIdx = addPos(sp.home_lat as number | null, sp.home_lng as number | null, "");

    for (let offset = 0; offset <= 30; offset++) {
      const date = addDays(today, offset);
      const dow = getISODay(date);
      const cfg = configByDow.get(dow);
      if (!cfg || !cfg.active) continue;

      const dateStr = format(date, "yyyy-MM-dd");
      const startTime = parse(cfg.work_start_time.slice(0, 5), "HH:mm", base);
      const endTime = parse(cfg.work_end_time.slice(0, 5), "HH:mm", base);

      const dayAppts = apptsFor(sp.id, dateStr)
        .map((a) => ({
          time: (a.start_time as string).slice(0, 5),
          posIdx: addPos(a.client_lat as number | null, a.client_lng as number | null, a.client_name ?? ""),
          label: a.client_name ?? a.client_address ?? "RDV",
        }))
        .sort((a, b) => a.time.localeCompare(b.time));

      const occupiedTimes = new Set(dayAppts.map((a) => a.time));

      for (const slot of FIXED_TIME_SLOTS) {
        const slotTime = parse(slot, "HH:mm", base);
        if (slotTime < startTime || slotTime >= endTime) continue;
        if (occupiedTimes.has(slot)) continue;

        const prevAppt = dayAppts.filter((a) => a.time < slot).at(-1);
        const nextAppt = dayAppts.find((a) => a.time > slot);

        // Maison uniquement si aucun RDV avant (1er créneau de la journée)
        const prevIdx = prevAppt?.posIdx ?? homeIdx;
        const nextIdx = nextAppt?.posIdx ?? -1;

        const tPrev = getSec(prevIdx);
        const tNext = nextIdx >= 0 ? getSec(nextIdx) : null;

        const score = scoreTravelSeconds(tPrev, tNext);
        const prevLabel = prevAppt?.label ?? `Domicile ${sp.name}`;
        const nextLabel = nextAppt?.label;
        const context = nextLabel
          ? `${prevLabel} → [prospect] → ${nextLabel}`
          : `Après : ${prevLabel}`;

        scored.push({
          salesperson_id: sp.id,
          salesperson_name: sp.name,
          date: dateStr,
          start_time: slot,
          dateFormatted: format(date, "EEEE d MMM", { locale: fr }),
          travel_seconds: score === Infinity ? null : score,
          context,
          score,
        });
      }
    }
  }

  // 6. Trier par score (plus court = mieux), retourner top N
  scored.sort((a, b) => a.score - b.score);
  const top = scored.slice(0, maxResults).map(({ score: _, ...rest }) => rest);

  return { ok: true, slots: top };
}

// ── Données semaine pour le calendrier prospect ───────────────────────────────

export type WeekSlotCell = {
  slot: string;           // "08:00"
  occupied: boolean;
  occupiedBy: string | null;
  travelSeconds: number | null;  // null si pas de GPS ou créneau occupé
  prevLabel: string;     // "Domicile Jim" ou "après Marie Roy"
};

export type WeekDayData = {
  date: string;          // "yyyy-MM-dd"
  dayOff: boolean;       // jour non travaillé selon config vendeur
  cells: WeekSlotCell[];
};

export type SalespersonWeekData = {
  salesperson_id: string;
  salesperson_name: string;
  days: WeekDayData[];   // lun-ven dans l'ordre
};

/**
 * Retourne la grille semaine (lun-ven) pour chaque vendeur actif :
 * créneaux libres scorés en minutes (moyenne prev/next).
 */
export async function getSlotsForWeekWithScores(
  prospectLat: number,
  prospectLng: number,
  weekMonday: string, // yyyy-MM-dd
  salespersonId?: string | null,
  excludeAppointmentId?: string | null
): Promise<{ ok: true; data: SalespersonWeekData[] } | { ok: false; message: string }> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { ok: false, message: "Clé Google Maps manquante" };

  const supabase = await createServerSupabaseClient();

  const monday = new Date(weekMonday + "T12:00:00");
  const weekDates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = addDays(monday, i);
    weekDates.push(format(d, "yyyy-MM-dd"));
  }
  const weekEnd = weekDates[4];

  let spQuery = supabase
    .from("salespeople")
    .select(`id, name, home_lat, home_lng, home_address,
               salesperson_day_config ( day_of_week, active, work_start_time, work_end_time )`)
    .eq("active", true)
    .order("name");

  if (salespersonId) {
    spQuery = spQuery.eq("id", salespersonId);
  }

  const [{ data: salespeople }, { data: rawWeekAppts }] = await Promise.all([
    spQuery,
    supabase
      .from("sales_appointments")
      .select("id, salesperson_id, scheduled_date, start_time, client_name, client_address, client_lat, client_lng")
      .neq("status", "cancelled")
      .gte("scheduled_date", weekDates[0])
      .lte("scheduled_date", weekEnd)
      .order("scheduled_date")
      .order("start_time"),
  ]);

  const weekAppts = (rawWeekAppts ?? []).filter(
    (a) => !excludeAppointmentId || a.id !== excludeAppointmentId
  );

  if (!salespeople?.length) return { ok: true, data: [] };

  type Pos = { lat: number; lng: number };
  const positions: Pos[] = [];
  const posMap = new Map<string, number>();
  const posKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

  const addPos = (lat: number | null, lng: number | null): number => {
    if (!lat || !lng) return -1;
    const k = posKey(lat, lng);
    if (posMap.has(k)) return posMap.get(k)!;
    const idx = positions.length;
    positions.push({ lat, lng });
    posMap.set(k, idx);
    return idx;
  };

  for (const sp of salespeople) addPos(sp.home_lat as number | null, sp.home_lng as number | null);
  for (const a of weekAppts) addPos(a.client_lat as number | null, a.client_lng as number | null);

  const secCache = new Map<number, number | null>();
  if (positions.length > 0) {
    const metrics = await fetchDrivingMetricsFromOrigin(
      apiKey,
      { lat: prospectLat, lng: prospectLng },
      positions
    );
    metrics.forEach((m, i) => secCache.set(i, m.seconds));
  }

  const getSec = (posIdx: number): number | null => {
    if (posIdx < 0) return null;
    return secCache.get(posIdx) ?? null;
  };

  const base = new Date(2000, 0, 1);

  const result: SalespersonWeekData[] = salespeople.map((sp) => {
    const configs = (sp.salesperson_day_config as {
      day_of_week: number; active: boolean; work_start_time: string; work_end_time: string;
    }[]) ?? [];
    const cfgByDow = new Map(configs.map((c) => [c.day_of_week, c]));
    const homeIdx = addPos(sp.home_lat as number | null, sp.home_lng as number | null);

    const days: WeekDayData[] = weekDates.map((dateStr) => {
      const dow = getISODay(new Date(dateStr + "T12:00:00"));
      const cfg = cfgByDow.get(dow);

      if (!cfg || !cfg.active) {
        return { date: dateStr, dayOff: true, cells: [] };
      }

      const startTime = parse(cfg.work_start_time.slice(0, 5), "HH:mm", base);
      const endTime = parse(cfg.work_end_time.slice(0, 5), "HH:mm", base);

      const dayAppts = weekAppts
        .filter((a) => a.salesperson_id === sp.id && a.scheduled_date === dateStr)
        .map((a) => ({
          time: (a.start_time as string).slice(0, 5),
          name: a.client_name ?? "—",
          posIdx: addPos(a.client_lat as number | null, a.client_lng as number | null),
        }))
        .sort((a, b) => a.time.localeCompare(b.time));

      const occupiedTimes = new Set(dayAppts.map((a) => a.time));

      const cells: WeekSlotCell[] = FIXED_TIME_SLOTS
        .filter((slot) => {
          const t = parse(slot, "HH:mm", base);
          return t >= startTime && t < endTime;
        })
        .map((slot) => {
          if (occupiedTimes.has(slot)) {
            const occ = dayAppts.find((a) => a.time === slot)!;
            return {
              slot,
              occupied: true,
              occupiedBy: occ.name,
              travelSeconds: null,
              prevLabel: "",
            };
          }

          const prev = dayAppts.filter((a) => a.time < slot).at(-1);
          const next = dayAppts.find((a) => a.time > slot);
          const prevIdx = prev?.posIdx ?? homeIdx;
          const nextIdx = next?.posIdx ?? -1;
          const tPrev = getSec(prevIdx);
          const tNext = nextIdx >= 0 ? getSec(nextIdx) : null;
          const score = scoreTravelSeconds(tPrev, tNext);
          const prevLabel = prev
            ? (next ? `${prev.name} ↔ ${next.name}` : `après ${prev.name}`)
            : (next ? `domicile → … → ${next.name}` : `départ domicile`);

          return {
            slot,
            occupied: false,
            occupiedBy: null,
            travelSeconds: score === Infinity ? null : score,
            prevLabel,
          };
        });

      return { date: dateStr, dayOff: false, cells };
    });

    return { salesperson_id: sp.id, salesperson_name: sp.name, days };
  });

  return { ok: true, data: result };
}

// ── Prospects classés par proximité pour un créneau donné ────────────────────

export type ProspectForSlot = {
  job_id: string;
  job_status: string;
  client_name: string;
  client_phone: string | null;
  client_city: string | null;
  client_address: string | null;
  client_lat: number;
  client_lng: number;
  distance_meters: number | null;
  /** Temps de trajet en secondes (Distance Matrix). */
  travel_seconds: number | null;
  prev_label: string;
};

/**
 * Retourne les prospects du pipeline classés par distance depuis
 * l'emplacement précédent du vendeur (dernier RDV du jour ou domicile).
 */
export async function getProspectsForSlot(
  salespersonId: string,
  date: string,
  startTime: string
): Promise<{ ok: true; prospects: ProspectForSlot[]; prevLabel: string; originLat: number | null; originLng: number | null } | { ok: false; message: string }> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const supabase = await createServerSupabaseClient();

  // 1. Vendeur (home coords)
  const { data: sp } = await supabase
    .from("salespeople")
    .select("home_lat, home_lng, name")
    .eq("id", salespersonId)
    .single();

  if (!sp) return { ok: false, message: "Vendeur introuvable" };

  // 2. RDV précédent ce jour-là (avant le créneau)
  const { data: dayAppts } = await supabase
    .from("sales_appointments")
    .select("start_time, client_name, client_lat, client_lng")
    .eq("salesperson_id", salespersonId)
    .eq("scheduled_date", date)
    .neq("status", "cancelled")
    .lt("start_time", startTime)
    .order("start_time", { ascending: false })
    .limit(1);

  const prevAppt = dayAppts?.[0] ?? null;
  const originLat: number | null = prevAppt?.client_lat ?? (sp.home_lat as number | null);
  const originLng: number | null = prevAppt?.client_lng ?? (sp.home_lng as number | null);
  const prevLabel = prevAppt
    ? `après ${prevAppt.client_name}`
    : `départ domicile (${(sp as { name: string }).name})`;

  // 3. Prospects du pipeline avec GPS
  const { data: jobs } = await supabase
    .from("jobs")
    .select(`
      id, status,
      clients ( name, phone, city, address_formatted, lat, lng )
    `)
    .in("status", ["soumission_en_attente", "soumission_repartie", "en_attente"])
    .order("created_at");

  if (!jobs?.length) return { ok: true, prospects: [], prevLabel, originLat, originLng };

  // Filtrer ceux avec GPS
  type RawJob = {
    id: string;
    status: string;
    clients: { name: string; phone: string | null; city: string | null; address_formatted: string | null; lat: number | null; lng: number | null } | null;
  };

  const gpsJobs = (jobs as unknown as RawJob[]).filter(
    (j) => j.clients?.lat && j.clients?.lng
  );

  if (!gpsJobs.length) return { ok: true, prospects: [], prevLabel, originLat, originLng };

  // Retourner immédiatement les prospects SANS distances (calcul séparé)
  const prospects: ProspectForSlot[] = gpsJobs.map((j) => ({
    job_id: j.id,
    job_status: j.status,
    client_name: j.clients!.name,
    client_phone: j.clients!.phone,
    client_city: j.clients!.city,
    client_address: j.clients!.address_formatted,
    client_lat: j.clients!.lat!,
    client_lng: j.clients!.lng!,
    distance_meters: null,
    travel_seconds: null,
    prev_label: prevLabel,
  }));

  return { ok: true, prospects, prevLabel, originLat, originLng };
}

/**
 * Calcul séparé des trajets (appelé en arrière-plan après affichage de la liste).
 * Retourne durée (secondes) et distance (mètres) pour chaque destination.
 */
export async function computeProspectDistances(
  originLat: number,
  originLng: number,
  destinations: { lat: number; lng: number }[]
): Promise<{ meters: number | null; seconds: number | null }[]> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey || !destinations.length) {
    return destinations.map(() => ({ meters: null, seconds: null }));
  }

  try {
    const metrics = await fetchDrivingMetricsFromOrigin(
      apiKey,
      { lat: originLat, lng: originLng },
      destinations
    );
    return metrics.map((m) => ({ meters: m.meters, seconds: m.seconds }));
  } catch {
    return destinations.map(() => ({ meters: null, seconds: null }));
  }
}
