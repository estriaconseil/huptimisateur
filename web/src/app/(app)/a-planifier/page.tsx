import { format, startOfWeek } from "date-fns";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";
import { DEFAULT_FULL_DAY_THRESHOLD } from "@/lib/constants";
import type { EstimatedDurationHours, Job } from "@/types/domain";
import { InstallJobsClient } from "@/features/dispatch/install-jobs-client";

export type InstallJob = {
  id: string;
  client_id: string;
  estimated_duration_hours: EstimatedDurationHours;
  status: Job["status"];
  installation_info: string | null;
  internal_notes: string | null;
  preferred_date: string | null;
  created_at: string;
  /** true si au moins une unité remplie n'a pas de # de série et pas de bypass individuel */
  missing_serial: boolean;
  /** Option retenue à l'acceptation, si la soumission a été acceptée. */
  accepted_option: "a" | "b" | null;
  clients: {
    name: string;
    phone: string | null;
    email: string | null;
    address_formatted: string | null;
    city: string | null;
    postal_code: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  installation_address: {
    address_formatted: string | null;
    city: string | null;
    postal_code: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  schedule: {
    id: string;
    scheduled_date: string;
    slot_type: string;
    team_name: string | null;
  } | null;
};

function weekMondayIso(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

type SerialUnit = {
  brand: string | null;
  model: string | null;
  unit_subtotal: number | null;
  serial_number: string | null;
  serial_bypass: boolean | null;
};

function jobMissingSerial(units: SerialUnit[]): boolean {
  for (const u of units) {
    const filled = !!(u.brand?.trim() || u.model?.trim() || (u.unit_subtotal ?? 0) > 0);
    if (!filled) continue;
    if (!u.serial_bypass && !u.serial_number?.trim()) return true;
  }
  return false;
}

export default async function APlanifierPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string; job?: string }>;
}) {
  const sp = await searchParams;
  const highlight = sp.highlight ?? null;
  const openJobId = sp.job ?? null;

  const supabase = await createServerSupabaseClient();

  const [{ data: rawJobs, error }, { data: settingsRow }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        `id, client_id, estimated_duration_hours, status, installation_info, internal_notes,
         preferred_date, created_at,
         clients ( name, phone, email, address_formatted, city, postal_code, lat, lng ),
         installation_addresses!installation_address_id ( address_formatted, city, postal_code, lat, lng ),
         schedules ( id, scheduled_date, slot_type, status, teams ( name ) ),
         quotes ( accepted_option, quote_units ( brand, model, unit_subtotal, serial_number, serial_bypass ) )`
      )
      .in("status", ["a_planifier", "reparti", "retour_a_faire"])
      .order("preferred_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("app_settings")
      .select("full_day_threshold_hours, serial_bypass_global")
      .limit(1)
      .maybeSingle(),
  ]);

  const fullDayThreshold: number =
    (settingsRow as { full_day_threshold_hours?: number | null } | null)
      ?.full_day_threshold_hours ?? DEFAULT_FULL_DAY_THRESHOLD;

  const serialBypassGlobal: boolean =
    (settingsRow as { serial_bypass_global?: boolean | null } | null)
      ?.serial_bypass_global ?? false;

  const jobs: InstallJob[] = (rawJobs ?? []).map((r: unknown) => {
    const row = r as {
      id: string;
      client_id: string;
      estimated_duration_hours: number;
      status: string;
      installation_info: string | null;
      internal_notes: string | null;
      preferred_date: string | null;
      created_at: string;
      clients: unknown;
      installation_addresses: unknown;
      schedules: unknown;
      quotes: unknown;
    };

    const client = unwrapRelation<{
      name: string;
      phone: string | null;
      email: string | null;
      address_formatted: string | null;
      city: string | null;
      postal_code: string | null;
      lat: number | null;
      lng: number | null;
    }>(row.clients);

    const installation_address = unwrapRelation<{
      address_formatted: string | null;
      city: string | null;
      postal_code: string | null;
      lat: number | null;
      lng: number | null;
    }>(row.installation_addresses);

    const schedArr = Array.isArray(row.schedules)
      ? (row.schedules as {
          id: string;
          scheduled_date: string;
          slot_type: string;
          status: string;
          teams: unknown;
        }[])
      : [];
    const planned = schedArr.find((s) => s.status === "planned") ?? schedArr[0] ?? null;
    const schedule = planned
      ? {
          id: planned.id,
          scheduled_date: planned.scheduled_date,
          slot_type: planned.slot_type,
          team_name: unwrapRelation<{ name: string }>(planned.teams)?.name ?? null,
        }
      : null;

    // Calcul missing_serial (si bypass global actif → toujours false)
    let missing_serial = false;
    let accepted_option: "a" | "b" | null = null;
    const quotesArr = Array.isArray(row.quotes) ? row.quotes : row.quotes ? [row.quotes] : [];
    if (quotesArr.length > 0) {
      const latest = quotesArr[0] as { accepted_option?: "a" | "b" | null };
      accepted_option = latest.accepted_option ?? null;
    }
    if (!serialBypassGlobal) {
      for (const q of quotesArr) {
        const rawUnits = (q as { quote_units?: unknown }).quote_units;
        const unitsArr = Array.isArray(rawUnits) ? rawUnits : rawUnits ? [rawUnits] : [];
        if (jobMissingSerial(unitsArr as SerialUnit[])) {
          missing_serial = true;
          break;
        }
      }
    }

    return {
      id: row.id,
      client_id: row.client_id,
      estimated_duration_hours: row.estimated_duration_hours as EstimatedDurationHours,
      status: row.status as Job["status"],
      installation_info: row.installation_info,
      internal_notes: row.internal_notes,
      preferred_date: row.preferred_date,
      created_at: row.created_at,
      missing_serial,
      accepted_option,
      clients: client,
      installation_address,
      schedule,
    };
  });

  return (
    <InstallJobsClient
      jobs={jobs}
      weekIso={weekMondayIso()}
      highlightJobId={highlight}
      scrollJobId={openJobId ?? highlight}
      fetchError={error?.message ?? null}
      fullDayThreshold={fullDayThreshold}
      serialBypassGlobal={serialBypassGlobal}
    />
  );
}
