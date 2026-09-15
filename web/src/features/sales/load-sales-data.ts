/** Chargement de données serveur uniquement — ne pas importer dans les composants client. */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cityFromAddress } from "@/lib/address";
import { getBusinessWeekDateStrings } from "@/lib/dispatch/business-week";
import type { SalesPageData, SalespersonForCalendar, BlockRow } from "./sales-utils";

export type { SalesPageData };

export async function loadSalesPageData(
  monday: Date,
  currentSalespersonId?: string | null
): Promise<SalesPageData> {
  const supabase = await createServerSupabaseClient();
  const weekDates = getBusinessWeekDateStrings(monday);

  // Construction des requêtes de base
  let spQuery = supabase
    .from("salespeople")
    .select(`
      id, name, active, profile_id,
      home_address, home_lat, home_lng,
      notes, created_at,
      salesperson_day_config ( day_of_week, active, work_start_time, work_end_time )
    `)
    .order("name");

  let apptQuery = supabase
    .from("sales_appointments")
    .select("id, salesperson_id, client_id, installation_address_id, client_lat, client_lng, scheduled_date, start_time, status, notes, quote_id, clients ( name, phone, address_formatted, city ), installation_addresses!installation_address_id ( city, address_formatted )")
    .gte("scheduled_date", weekDates[0])
    .lte("scheduled_date", weekDates[weekDates.length - 1])
    .neq("status", "cancelled");

  let blocksQuery = supabase
    .from("salesperson_blocks")
    .select("id, salesperson_id, block_type, start_date, end_date, start_time, end_time, notes")
    .lte("start_date", weekDates[weekDates.length - 1])
    .gte("end_date", weekDates[0]);

  if (currentSalespersonId) {
    // Mode vendeur : restreindre à son propre ID (actif ou non)
    spQuery = spQuery.eq("id", currentSalespersonId);
    apptQuery = apptQuery.eq("salesperson_id", currentSalespersonId);
    blocksQuery = blocksQuery.eq("salesperson_id", currentSalespersonId);
  } else {
    // Mode admin/secrétaire : uniquement les vendeurs actifs (+ inactifs avec RDV, détectés après)
    spQuery = spQuery.eq("active", true);
  }

  const [{ data: salespeopleData }, { data: appointments }, { data: rawBlocks }] = await Promise.all([
    spQuery,
    apptQuery,
    blocksQuery,
  ]);

  let salespeople: SalespersonForCalendar[];

  if (currentSalespersonId) {
    // Le vendeur voit uniquement sa propre rangée
    salespeople = (salespeopleData ?? []) as SalespersonForCalendar[];
  } else {
    // Admin/secrétaire : actifs + vendeurs inactifs qui ont quand même des RDV cette semaine
    const activeIds = new Set((salespeopleData ?? []).map((sp) => sp.id as string));
    const inactiveSpIds = [
      ...new Set(
        (appointments ?? [])
          .map((a) => a.salesperson_id as string)
          .filter((id) => !activeIds.has(id))
      ),
    ];

    let inactiveSalespeople: SalespersonForCalendar[] = [];
    if (inactiveSpIds.length > 0) {
      const { data } = await supabase
        .from("salespeople")
        .select(`
          id, name, active, profile_id,
          home_address, home_lat, home_lng,
          notes, created_at,
          salesperson_day_config ( day_of_week, active, work_start_time, work_end_time )
        `)
        .in("id", inactiveSpIds)
        .order("name");
      inactiveSalespeople = (data ?? []) as SalespersonForCalendar[];
    }

    salespeople = [
      ...(salespeopleData ?? []) as SalespersonForCalendar[],
      ...inactiveSalespeople,
    ];
  }

  // Ownership lock + job_id + missing_serial depuis les jobs/quotes liés
  const apptIds = (appointments ?? []).map((a) => a.id as string);
  const lockByAppt = new Map<string, boolean>();
  const jobIdByAppt = new Map<string, string>();
  const missingSerialByAppt = new Map<string, boolean>();

  if (apptIds.length > 0) {
    const { data: linkedJobs } = await supabase
      .from("jobs")
      .select("id, appointment_id, salesperson_locked")
      .in("appointment_id", apptIds);
    for (const j of linkedJobs ?? []) {
      const row = j as { id: string; appointment_id: string | null; salesperson_locked: boolean | null };
      if (row.appointment_id) {
        lockByAppt.set(row.appointment_id, row.salesperson_locked ?? false);
        jobIdByAppt.set(row.appointment_id, row.id);
      }
    }
  }

  // Vérifier les # de série manquants via les soumissions liées aux RDV
  const quoteIds = (appointments ?? [])
    .map((a) => (a as unknown as { quote_id: string | null }).quote_id)
    .filter(Boolean) as string[];
  const quoteToAppt = new Map<string, string>();
  for (const a of appointments ?? []) {
    const raw = a as unknown as { id: string; quote_id: string | null };
    if (raw.quote_id) quoteToAppt.set(raw.quote_id, raw.id);
  }
  if (quoteIds.length > 0) {
    const [{ data: unitRows }, { data: quoteRows }] = await Promise.all([
      supabase
        .from("quote_units")
        .select("quote_id, brand, model, description, unit_subtotal, serial_number, serial_evaporator, is_alternative")
        .in("quote_id", quoteIds),
      supabase
        .from("quotes")
        .select("id, accepted_option")
        .in("id", quoteIds),
    ]);
    const acceptedByQuote = new Map(
      (quoteRows ?? []).map((q) => {
        const row = q as { id: string; accepted_option: "a" | "b" | null };
        return [row.id, row.accepted_option ?? "a"] as const;
      })
    );
    const quoteHasMissing = new Map<string, boolean>();
    for (const u of unitRows ?? []) {
      const row = u as {
        quote_id: string;
        brand: string | null;
        model: string | null;
        description: string | null;
        unit_subtotal: number | null;
        serial_number: string | null;
        serial_evaporator: string | null;
        is_alternative: boolean | null;
      };
      const accepted = acceptedByQuote.get(row.quote_id) ?? "a";
      if ((accepted === "b") !== (row.is_alternative ?? false)) continue;
      const filled = !!(row.brand?.trim() || row.model?.trim() || row.description?.trim() || (row.unit_subtotal ?? 0) > 0);
      if (!filled) continue;
      const hasSerial = !!(row.serial_number?.trim() || row.serial_evaporator?.trim());
      if (!hasSerial) {
        quoteHasMissing.set(row.quote_id, true);
      }
    }
    for (const [qId, hasMissing] of quoteHasMissing) {
      const apptId = quoteToAppt.get(qId);
      if (apptId) missingSerialByAppt.set(apptId, hasMissing);
    }
  }

  return {
    salespeople,
    appointments: (appointments ?? []).map((a) => {
      const raw = a as unknown as {
        id: string;
        salesperson_id: string;
        client_id: string;
        installation_address_id: string | null;
        client_lat: number | null;
        client_lng: number | null;
        scheduled_date: string;
        start_time: string;
        status: string;
        notes: string | null;
        quote_id: string | null;
        clients: { name: string; phone: string | null; address_formatted: string | null; city: string | null } | { name: string; phone: string | null; address_formatted: string | null; city: string | null }[] | null;
        installation_addresses: { city: string | null; address_formatted: string | null } | { city: string | null; address_formatted: string | null }[] | null;
      };
      const c = Array.isArray(raw.clients) ? raw.clients[0] : raw.clients;
      const inst = Array.isArray(raw.installation_addresses)
        ? raw.installation_addresses[0]
        : raw.installation_addresses;
      const clientCity =
        inst?.city?.trim() ||
        cityFromAddress(inst?.address_formatted) ||
        c?.city?.trim() ||
        cityFromAddress(c?.address_formatted) ||
        null;
      return {
        id: raw.id,
        salesperson_id: raw.salesperson_id,
        client_id: raw.client_id,
        installation_address_id: raw.installation_address_id ?? null,
        client_name: c?.name ?? "—",
        client_phone: c?.phone ?? null,
        client_address: inst?.address_formatted ?? c?.address_formatted ?? null,
        client_city: clientCity,
        client_lat: raw.client_lat,
        client_lng: raw.client_lng,
        scheduled_date: raw.scheduled_date,
        start_time: (raw.start_time as string).slice(0, 5),
        status: raw.status,
        notes: raw.notes,
        quote_id: raw.quote_id,
        job_id: jobIdByAppt.get(raw.id) ?? null,
        salesperson_locked: lockByAppt.get(raw.id) ?? false,
        missing_serial: missingSerialByAppt.get(raw.id) ?? false,
      };
    }),
    blocks: (rawBlocks ?? []) as BlockRow[],
    weekDates,
  };
}
