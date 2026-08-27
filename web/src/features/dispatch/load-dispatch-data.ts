import { format, parseISO, startOfWeek } from "date-fns";
import { defaultBusinessWeekMonday } from "@/lib/dispatch/business-week";

import { getBusinessWeekDateStrings } from "@/lib/dispatch/business-week";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { EnrichedScheduleRow } from "@/services/planning/dispatch-state";
import type { AppSettings, EstimatedDurationHours, Job, Team, TeamBlock, Technician } from "@/types/domain";

export type TeamWithTechs = Team & { technicians: Pick<Technician, "id" | "first_name" | "last_name">[] };

export type JobPickerRow = Pick<
  Job,
  "id" | "estimated_duration_hours" | "status" | "installation_info" | "preferred_date" | "created_at"
> & {
  clients: { name: string; city: string | null } | null;
  installation_address: {
    lat: number | null;
    lng: number | null;
    city: string | null;
    address_formatted: string | null;
  } | null;
};

export type RetourAFaireRow = {
  id: string;
  installation_info: string | null;
  created_at: string;
  clients: { name: string; city: string | null } | null;
};

function mondayFromParam(weekParam: string | undefined): Date {
  if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    return startOfWeek(parseISO(weekParam), { weekStartsOn: 1 });
  }
  return defaultBusinessWeekMonday();
}

function unitsMissingSerial(quotes: unknown): boolean {
  const list = Array.isArray(quotes) ? quotes : quotes ? [quotes] : [];
  for (const q of list) {
    const quote = q as { accepted_option?: "a" | "b" | null; quote_units?: unknown };
    const accepted = quote.accepted_option ?? "a";
    const raw = quote.quote_units;
    const units = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const u of units) {
      const row = u as {
        brand?: string | null;
        model?: string | null;
        unit_subtotal?: number | null;
        serial_number?: string | null;
        serial_evaporator?: string | null;
        is_alternative?: boolean | null;
      };
      const isAlt = row.is_alternative ?? false;
      if ((accepted === "b") !== isAlt) continue;
      const filled = !!(row.brand?.trim() || row.model?.trim() || (row.unit_subtotal ?? 0) > 0);
      if (!filled) continue;
      const hasSerial = !!(row.serial_number?.trim() || row.serial_evaporator?.trim());
      if (!hasSerial) return true;
    }
  }
  return false;
}

export async function loadDispatchPageData(weekParam: string | undefined) {
  const monday = mondayFromParam(weekParam);
  const weekDates = getBusinessWeekDateStrings(monday);
  const weekStartLabel = format(monday, "yyyy-MM-dd");
  const rangeStart = weekDates[0];
  const rangeEnd = weekDates[weekDates.length - 1];

  const supabase = await createServerSupabaseClient();

  const [
    teamsRes,
    schedulesRes,
    jobsRes,
    retourRes,
    settingsRes,
    teamBlocksRes,
  ] = await Promise.all([
    supabase
      .from("teams")
      .select(
        `id, name, active, color, notes, created_at,
         team_technicians ( technicians ( id, first_name, last_name ) )`
      )
      .order("name"),
    supabase
      .from("schedules")
      .select(
        `
        id,
        job_id,
        team_id,
        scheduled_date,
        slot_type,
        status,
        jobs (
          id,
          estimated_duration_hours,
          clients ( name, city, phone, email, lat, lng, address_formatted ),
          installation_addresses!installation_address_id ( lat, lng, city, address_formatted ),
          quotes ( accepted_option, quote_units ( serial_number, serial_evaporator, brand, model, unit_subtotal, is_alternative ) )
        )
      `
      )
      .gte("scheduled_date", rangeStart)
      .lte("scheduled_date", rangeEnd)
      .eq("status", "planned"),
    /* Seules les jobs "a_planifier" = soumission acceptée, attendent un créneau.
       assignJobToSlot → status = reparti / removeSchedule → status = a_planifier. */
    supabase
      .from("jobs")
      .select(
        `
        id,
        estimated_duration_hours,
        status,
        installation_info,
        preferred_date,
        created_at,
        clients ( name, city ),
        installation_addresses!installation_address_id ( lat, lng, city, address_formatted )
      `
      )
      .eq("status", "a_planifier")
      .order("created_at", { ascending: false }),
    /* Jobs "retour_a_faire" = oubli technicien, liste d'attente sans date */
    supabase
      .from("jobs")
      .select(`id, installation_info, created_at, clients ( name, city )`)
      .eq("status", "retour_a_faire")
      .order("created_at", { ascending: false }),
    supabase.from("app_settings").select("*").limit(1).maybeSingle(),
    supabase
      .from("team_blocks")
      .select("id, team_id, blocked_date, slot_type, notes, created_at")
      .gte("blocked_date", rangeStart)
      .lte("blocked_date", rangeEnd),
  ]);

  /* Toutes les jobs "a_planifier" attendent un créneau — pas besoin de filtrage supplémentaire. */
  const jobsForPicker: JobPickerRow[] = (jobsRes.data ?? []).map((rowRaw) => {
    const row = rowRaw as {
      id: string;
      estimated_duration_hours: number;
      status: string;
      installation_info: string | null;
      preferred_date: string | null;
      created_at: string;
      clients: unknown;
      installation_addresses: unknown;
    };
    const clients = unwrapRelation<{ name: string; city: string | null }>(row.clients);
    const installation_address = unwrapRelation<{
      lat: number | null;
      lng: number | null;
      city: string | null;
      address_formatted: string | null;
    }>(row.installation_addresses);
    return {
      id: row.id,
      estimated_duration_hours: row.estimated_duration_hours as EstimatedDurationHours,
      status: row.status as Job["status"],
      installation_info: row.installation_info,
      preferred_date: row.preferred_date,
      created_at: row.created_at,
      clients,
      installation_address,
    };
  });

  const schedules: EnrichedScheduleRow[] = (schedulesRes.data ?? []).map((raw: unknown) => {
    const row = raw as {
      id: string;
      job_id: string;
      team_id: string;
      scheduled_date: string;
      slot_type: EnrichedScheduleRow["slot_type"];
      status: string;
      jobs: unknown;
    };
    const jo = unwrapRelation<{
      id: string;
      estimated_duration_hours: number;
      clients: unknown;
      installation_addresses: unknown;
      quotes: unknown;
    }>(row.jobs);
    const job: EnrichedScheduleRow["job"] = jo
      ? {
          id: jo.id,
          estimated_duration_hours: jo.estimated_duration_hours as EstimatedDurationHours,
          clients: unwrapRelation<{
            name: string;
            city: string | null;
            phone: string | null;
            email: string | null;
            lat: number | null;
            lng: number | null;
            address_formatted: string | null;
          }>(jo.clients),
          installation_address: unwrapRelation<{
            lat: number | null;
            lng: number | null;
            city: string | null;
            address_formatted: string | null;
          }>(jo.installation_addresses),
          missingSerial: unitsMissingSerial(jo.quotes),
        }
      : null;
    return {
      id: row.id,
      job_id: row.job_id,
      team_id: row.team_id,
      scheduled_date: row.scheduled_date,
      slot_type: row.slot_type,
      status: row.status,
      job,
    };
  });

  type TeamRow = Team & {
    team_technicians: { technicians: { id: string; first_name: string; last_name: string } | null }[];
  };

  const retourAFaireJobs: RetourAFaireRow[] = (retourRes.data ?? []).map((rawRaw) => {
    const row = rawRaw as { id: string; installation_info: string | null; created_at: string; clients: unknown };
    return {
      id: row.id,
      installation_info: row.installation_info,
      created_at: row.created_at,
      clients: unwrapRelation<{ name: string; city: string | null }>(row.clients),
    };
  });

  return {
    weekDates,
    weekStartLabel,
    teams: (teamsRes.data ?? []).map((row: unknown) => {
      const r = row as TeamRow;
      return {
        id: r.id,
        name: r.name,
        active: r.active,
        color: r.color,
        notes: r.notes,
        created_at: r.created_at,
        technicians: (r.team_technicians ?? [])
          .map((tt) => tt.technicians)
          .filter((t): t is { id: string; first_name: string; last_name: string } => t !== null),
      } satisfies TeamWithTechs;
    }),
    schedules,
    jobsForPicker,
    retourAFaireJobs,
    settings: settingsRes.data as AppSettings | null,
    teamBlocks: (teamBlocksRes.data ?? []) as TeamBlock[],
    errors: {
      teams: teamsRes.error?.message,
      schedules: schedulesRes.error?.message,
      jobs: jobsRes.error?.message,
    },
  };
}
