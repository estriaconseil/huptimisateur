import type { ScheduleSlot } from "@/types/domain";

export type SlotHalf = "am" | "pm";

/** État d’une journée pour une équipe (créneaux affichés). */
export type DaySlotBusy = {
  kind: "busy";
  scheduleId: string;
  jobId: string;
  label: string;
  city: string | null;
  phone: string | null;
  email: string | null;
};

export type DayDispatchState = {
  fullDay: boolean;
  am: { kind: "free" } | DaySlotBusy;
  pm: { kind: "free" } | DaySlotBusy;
};

export type EnrichedScheduleRow = {
  id: string;
  job_id: string;
  team_id: string;
  scheduled_date: string;
  slot_type: ScheduleSlot;
  status: string;
  job: {
    id: string;
    estimated_duration_hours: number;
    clients: {
      name: string;
      city: string | null;
      phone: string | null;
      email: string | null;
      lat: number | null;
      lng: number | null;
    } | null;
  } | null;
};

function labelFromRow(row: EnrichedScheduleRow): string {
  const name = row.job?.clients?.name ?? "Client";
  return name;
}

/** Clé `teamId|yyyy-MM-dd` → état dérivé des lignes `planned`. */
export function buildDispatchStateMap(
  rows: EnrichedScheduleRow[]
): Map<string, DayDispatchState> {
  const map = new Map<string, DayDispatchState>();

  const planned = rows.filter((r) => r.status === "planned");

  for (const row of planned) {
    const key = `${row.team_id}|${row.scheduled_date}`;
    let day = map.get(key);
    if (!day) {
      day = {
        fullDay: false,
        am: { kind: "free" },
        pm: { kind: "free" },
      };
      map.set(key, day);
    }

    const label = labelFromRow(row);
    const city = row.job?.clients?.city ?? null;
    const phone = row.job?.clients?.phone ?? null;
    const email = row.job?.clients?.email ?? null;

    if (row.slot_type === "full_day") {
      day.fullDay = true;
      const busy: DaySlotBusy = {
        kind: "busy",
        scheduleId: row.id,
        jobId: row.job_id,
        label,
        city,
        phone,
        email,
      };
      day.am = busy;
      day.pm = busy;
    } else if (row.slot_type === "am") {
      day.am = { kind: "busy", scheduleId: row.id, jobId: row.job_id, label, city, phone, email };
    } else if (row.slot_type === "pm") {
      day.pm = { kind: "busy", scheduleId: row.id, jobId: row.job_id, label, city, phone, email };
    }
  }

  return map;
}

export function getDayState(
  stateMap: Map<string, DayDispatchState>,
  teamId: string,
  dateStr: string
): DayDispatchState {
  return (
    stateMap.get(`${teamId}|${dateStr}`) ?? {
      fullDay: false,
      am: { kind: "free" },
      pm: { kind: "free" },
    }
  );
}

/** Peut-on affecter ce demi-créneau ? (équipe active + libre + pas journée bloquée par l’autre sens déjà géré) */
export function canAssignToHalf(
  state: DayDispatchState,
  half: SlotHalf,
  teamActive: boolean
): boolean {
  if (!teamActive) return false;
  if (state.fullDay) return false;
  if (half === "am" && state.am.kind === "busy") return false;
  if (half === "pm" && state.pm.kind === "busy") return false;
  return true;
}

export function canAssignFullDay(state: DayDispatchState, teamActive: boolean): boolean {
  if (!teamActive) return false;
  if (state.fullDay) return false;
  if (state.am.kind === "busy" || state.pm.kind === "busy") return false;
  return true;
}
