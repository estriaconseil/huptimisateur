"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-role";
import {
  EMPTY_AUDIT_LOOKUPS,
  type AuditLookups,
} from "@/lib/audit-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types (réexportés pour que les composants client importent depuis ici)
// ─────────────────────────────────────────────────────────────────────────────

export type AuditEntry = {
  id: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null; // full_name du profil
  changed_at: string;
  /** Origine lisible quand plusieurs tables sont agrégées (ex: "Client", "RDV"). */
  source_label?: string | null;
};

export type AuditSource = {
  tableName: string;
  recordId: string;
  sourceLabel?: string;
};

export type AuditLogResult =
  | { ok: true; entries: AuditEntry[]; lookups: AuditLookups }
  | { ok: false; message: string };

type AuditRow = {
  id: string;
  operation: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
};

function mapRows(data: unknown[] | null, sourceLabel?: string): AuditEntry[] {
  return (data ?? []).map((row: unknown) => {
    const r = row as AuditRow;
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id:           r.id,
      operation:    r.operation as AuditEntry["operation"],
      old_data:     r.old_data,
      new_data:     r.new_data,
      changed_by:   profile?.full_name ?? null,
      changed_at:   r.changed_at,
      source_label: sourceLabel ?? null,
    };
  });
}

function collectIds(entries: AuditEntry[], field: string): string[] {
  const ids = new Set<string>();
  for (const e of entries) {
    for (const data of [e.old_data, e.new_data]) {
      const v = data?.[field];
      if (typeof v === "string" && v.length > 0) ids.add(v);
    }
  }
  return [...ids];
}

async function buildLookups(entries: AuditEntry[]): Promise<AuditLookups> {
  if (entries.length === 0) return EMPTY_AUDIT_LOOKUPS;

  const salespersonIds = collectIds(entries, "salesperson_id");
  const teamIds        = collectIds(entries, "team_id");
  const appointmentIds = collectIds(entries, "appointment_id");
  const clientIds      = collectIds(entries, "client_id");
  const quoteIds       = collectIds(entries, "quote_id");

  if (
    salespersonIds.length === 0 &&
    teamIds.length === 0 &&
    appointmentIds.length === 0 &&
    clientIds.length === 0 &&
    quoteIds.length === 0
  ) {
    return EMPTY_AUDIT_LOOKUPS;
  }

  const supabase = await createServerSupabaseClient();
  const lookups: AuditLookups = {
    salespeople: {},
    teams: {},
    appointments: {},
    clients: {},
    quotes: {},
  };

  const [spRes, teamRes, apptRes, clientRes, quoteRes] = await Promise.all([
    salespersonIds.length
      ? supabase.from("salespeople").select("id, name").in("id", salespersonIds)
      : Promise.resolve({ data: null }),
    teamIds.length
      ? supabase.from("teams").select("id, name").in("id", teamIds)
      : Promise.resolve({ data: null }),
    appointmentIds.length
      ? supabase
          .from("sales_appointments")
          .select("id, scheduled_date, start_time")
          .in("id", appointmentIds)
      : Promise.resolve({ data: null }),
    clientIds.length
      ? supabase.from("clients").select("id, name").in("id", clientIds)
      : Promise.resolve({ data: null }),
    quoteIds.length
      ? supabase.from("quotes").select("id, quote_number").in("id", quoteIds)
      : Promise.resolve({ data: null }),
  ]);

  for (const row of spRes.data ?? []) {
    lookups.salespeople[row.id] = row.name;
  }
  for (const row of teamRes.data ?? []) {
    lookups.teams[row.id] = row.name;
  }
  for (const row of apptRes.data ?? []) {
    const time = String(row.start_time ?? "").slice(0, 5);
    lookups.appointments[row.id] = time
      ? `${row.scheduled_date} ${time}`
      : String(row.scheduled_date);
  }
  for (const row of clientRes.data ?? []) {
    lookups.clients[row.id] = row.name;
  }
  for (const row of quoteRes.data ?? []) {
    lookups.quotes[row.id] =
      row.quote_number != null ? `#${row.quote_number}` : row.id;
  }

  return lookups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server actions
// ─────────────────────────────────────────────────────────────────────────────

/** Récupère l'historique d'audit pour un enregistrement. Admin seulement. */
export async function getAuditLog(
  tableName: string,
  recordId: string,
  limit = 100,
): Promise<AuditLogResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, operation, old_data, new_data, changed_at, profiles ( full_name )")
    .eq("table_name", tableName)
    .eq("record_id", recordId)
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, message: error.message };

  const entries = mapRows(data);
  const lookups = await buildLookups(entries);
  return { ok: true, entries, lookups };
}

/**
 * Agrège l'historique de plusieurs enregistrements liés (ex: RDV + client + job).
 * Trié du plus récent au plus ancien.
 */
export async function getAuditLogMulti(
  sources: AuditSource[],
  limit = 150,
): Promise<AuditLogResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const valid = sources.filter((s) => s.tableName && s.recordId);
  if (valid.length === 0) {
    return { ok: true, entries: [], lookups: EMPTY_AUDIT_LOOKUPS };
  }

  const supabase = await createServerSupabaseClient();

  const results = await Promise.all(
    valid.map(async (s) => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, operation, old_data, new_data, changed_at, profiles ( full_name )")
        .eq("table_name", s.tableName)
        .eq("record_id", s.recordId)
        .order("changed_at", { ascending: false })
        .limit(limit);
      if (error) return { error: error.message, entries: [] as AuditEntry[] };
      return { error: null, entries: mapRows(data, s.sourceLabel) };
    }),
  );

  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) return { ok: false, message: firstErr.error };

  const merged = results
    .flatMap((r) => r.entries)
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
    .slice(0, limit);

  const lookups = await buildLookups(merged);
  return { ok: true, entries: merged, lookups };
}
