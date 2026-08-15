import type { SupabaseClient } from "@supabase/supabase-js";

import { getBackupPeriod } from "@/features/interruption/date-utils";
import type {
  BackupInstallRow,
  BackupPayload,
  BackupSalesRow,
} from "@/features/interruption/types";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";

const APPT_STATUS: Record<string, string> = {
  scheduled: "Prévu",
  completed: "Complété",
  no_show: "Absent",
};

const BLOCK_TYPE: Record<string, string> = {
  vacances: "Vacances",
  bureau: "Bureau",
  autre: "Autre",
};

function pickPhone(cell: string | null | undefined, phone: string | null | undefined): string {
  const c = cell?.trim();
  if (c) return c;
  return phone?.trim() || "—";
}

function timeShort(t: string | null | undefined): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

function slotLabel(slot: string): string {
  if (slot === "am") return "AM";
  if (slot === "pm") return "PM";
  if (slot === "full_day") return "JOUR";
  return slot;
}

export async function loadBackupPayload(
  supabase: SupabaseClient,
  now = new Date()
): Promise<BackupPayload> {
  const period = getBackupPeriod(now);
  const { periodStart, periodEnd, week1Label, week2Label, businessDates } = period;

  const [
    apptsRes,
    blocksRes,
    schedulesRes,
    salespeopleRes,
    teamsRes,
  ] = await Promise.all([
    supabase
      .from("sales_appointments")
      .select(
        `
        id, scheduled_date, start_time, status, notes, quote_id, salesperson_id,
        clients ( name, phone, address_formatted, city )
      `
      )
      .gte("scheduled_date", periodStart)
      .lte("scheduled_date", periodEnd)
      .neq("status", "cancelled")
      .order("scheduled_date")
      .order("start_time"),
    supabase
      .from("salesperson_blocks")
      .select("id, salesperson_id, block_type, start_date, end_date, start_time, end_time, notes")
      .lte("start_date", periodEnd)
      .gte("end_date", periodStart),
    supabase
      .from("schedules")
      .select(
        `
        id, scheduled_date, slot_type, team_id,
        jobs (
          id, estimated_duration_hours, installation_info,
          clients ( name, phone, address_formatted, city ),
          installation_addresses:installation_address_id ( address_formatted, city ),
          quotes ( quote_number )
        )
      `
      )
      .gte("scheduled_date", periodStart)
      .lte("scheduled_date", periodEnd)
      .eq("status", "planned")
      .order("scheduled_date")
      .order("slot_type"),
    supabase.from("salespeople").select("id, name"),
    supabase.from("teams").select("id, name"),
  ]);

  const apptIds = (apptsRes.data ?? []).map((a) => a.id as string);
  const quoteIds = (apptsRes.data ?? [])
    .map((a) => a.quote_id as string | null)
    .filter((id): id is string => !!id);

  const quoteByAppt = new Map<
    string,
    { quote_number: number; client_cell: string | null; client_phone: string | null; client_address: string | null }
  >();
  const quoteById = new Map<
    string,
    { quote_number: number; client_cell: string | null; client_phone: string | null; client_address: string | null }
  >();

  if (apptIds.length > 0 || quoteIds.length > 0) {
    let q = supabase
      .from("quotes")
      .select("id, appointment_id, quote_number, client_cell, client_phone, client_address");
    if (apptIds.length && quoteIds.length) {
      q = q.or(
        `appointment_id.in.(${apptIds.join(",")}),id.in.(${quoteIds.join(",")})`
      );
    } else if (apptIds.length) {
      q = q.in("appointment_id", apptIds);
    } else {
      q = q.in("id", quoteIds);
    }
    const { data: quotes } = await q;
    for (const raw of quotes ?? []) {
      const row = raw as {
        id: string;
        appointment_id: string | null;
        quote_number: number;
        client_cell: string | null;
        client_phone: string | null;
        client_address: string | null;
      };
      const packed = {
        quote_number: row.quote_number,
        client_cell: row.client_cell,
        client_phone: row.client_phone,
        client_address: row.client_address,
      };
      quoteById.set(row.id, packed);
      if (row.appointment_id) quoteByAppt.set(row.appointment_id, packed);
    }
  }

  const spName = new Map<string, string>();
  for (const s of salespeopleRes.data ?? []) {
    spName.set(s.id as string, (s.name as string) || "Vendeur");
  }
  const teamName = new Map<string, string>();
  for (const t of teamsRes.data ?? []) {
    teamName.set(t.id as string, (t.name as string) || "Équipe");
  }

  const salesByDate: Record<string, BackupSalesRow[]> = {};
  for (const d of businessDates) salesByDate[d] = [];

  for (const raw of apptsRes.data ?? []) {
    const row = raw as {
      id: string;
      scheduled_date: string;
      start_time: string;
      status: string;
      salesperson_id: string;
      quote_id: string | null;
      clients: unknown;
    };
    if (!businessDates.includes(row.scheduled_date)) continue;

    const client = unwrapRelation<{
      name: string;
      phone: string | null;
      address_formatted: string | null;
      city: string | null;
    }>(row.clients);
    const quote =
      (row.quote_id ? quoteById.get(row.quote_id) : undefined) ??
      quoteByAppt.get(row.id);

    const phone = pickPhone(quote?.client_cell, quote?.client_phone ?? client?.phone);
    const address =
      (quote?.client_address || client?.address_formatted || "").trim() ||
      [client?.city].filter(Boolean).join(", ") ||
      "—";

    const statusLabel = APPT_STATUS[row.status] ?? row.status;
    const qn = quote?.quote_number != null ? String(quote.quote_number) : "—";

    salesByDate[row.scheduled_date].push({
      date: row.scheduled_date,
      time: timeShort(row.start_time),
      salespersonName: spName.get(row.salesperson_id) ?? "Vendeur",
      clientName: client?.name?.trim() || "—",
      phone,
      address,
      statusLabel,
      quoteNumber: qn === "—" ? `— (${statusLabel})` : qn,
    });
  }

  // Blocs vendeurs : une ligne par jour ouvré chevauché
  for (const raw of blocksRes.data ?? []) {
    const b = raw as {
      salesperson_id: string;
      block_type: string;
      start_date: string;
      end_date: string;
      start_time: string | null;
      end_time: string | null;
      notes: string | null;
    };
    const label = BLOCK_TYPE[b.block_type] ?? b.block_type;
    const time =
      b.start_time || b.end_time
        ? `${timeShort(b.start_time)}–${timeShort(b.end_time)}`
        : "JOUR";
    for (const d of businessDates) {
      if (d < b.start_date || d > b.end_date) continue;
      salesByDate[d].push({
        date: d,
        time,
        salespersonName: spName.get(b.salesperson_id) ?? "Vendeur",
        clientName: `BLOC — ${label}`,
        phone: "—",
        address: b.notes?.trim() || "—",
        statusLabel: "Bloc",
        quoteNumber: "—",
        isBlock: true,
      });
    }
  }

  // Tri : par vendeur puis heure
  for (const d of businessDates) {
    salesByDate[d].sort((a, b) => {
      const sp = a.salespersonName.localeCompare(b.salespersonName, "fr");
      if (sp !== 0) return sp;
      return a.time.localeCompare(b.time);
    });
    if (salesByDate[d].length === 0) delete salesByDate[d];
  }

  const installByDate: Record<string, BackupInstallRow[]> = {};
  for (const d of businessDates) installByDate[d] = [];

  for (const raw of schedulesRes.data ?? []) {
    const row = raw as {
      scheduled_date: string;
      slot_type: string;
      team_id: string;
      jobs: unknown;
    };
    if (!businessDates.includes(row.scheduled_date)) continue;

    const job = unwrapRelation<{
      estimated_duration_hours: number;
      installation_info: string | null;
      clients: unknown;
      installation_addresses: unknown;
      quotes: unknown;
    }>(row.jobs);

    const client = unwrapRelation<{
      name: string;
      phone: string | null;
      address_formatted: string | null;
      city: string | null;
    }>(job?.clients);
    const installAddr = unwrapRelation<{
      address_formatted: string | null;
      city: string | null;
    }>(job?.installation_addresses);

    let quoteNumber = "—";
    const quotesRaw = job?.quotes;
    if (Array.isArray(quotesRaw) && quotesRaw[0]) {
      quoteNumber = String((quotesRaw[0] as { quote_number?: number }).quote_number ?? "—");
    } else {
      const q = unwrapRelation<{ quote_number: number }>(quotesRaw);
      if (q?.quote_number != null) quoteNumber = String(q.quote_number);
    }

    const address =
      (installAddr?.address_formatted || client?.address_formatted || "").trim() ||
      [installAddr?.city || client?.city].filter(Boolean).join(", ") ||
      "—";

    const hours = job?.estimated_duration_hours ?? 4;

    installByDate[row.scheduled_date].push({
      date: row.scheduled_date,
      slotLabel: slotLabel(row.slot_type),
      teamName: teamName.get(row.team_id) ?? "Équipe",
      clientName: client?.name?.trim() || "—",
      phone: pickPhone(null, client?.phone),
      address,
      durationLabel: `${hours}h`,
      notes: (job?.installation_info || "").trim() || "—",
      quoteNumber,
    });
  }

  for (const d of businessDates) {
    installByDate[d].sort((a, b) => {
      const t = a.teamName.localeCompare(b.teamName, "fr");
      if (t !== 0) return t;
      const order = { AM: 0, PM: 1, JOUR: 2 } as Record<string, number>;
      return (order[a.slotLabel] ?? 9) - (order[b.slotLabel] ?? 9);
    });
    if (installByDate[d].length === 0) delete installByDate[d];
  }

  const salesEmpty = Object.keys(salesByDate).length === 0;
  const installEmpty = Object.keys(installByDate).length === 0;

  return {
    generatedAtIso: now.toISOString(),
    periodStart,
    periodEnd,
    week1Label,
    week2Label,
    salesByDate,
    installByDate,
    salesEmpty,
    installEmpty,
  };
}
