import {
  buildDispatchStateMap,
  getDayState,
  type EnrichedScheduleRow,
} from "@/services/planning/dispatch-state";
import { slotsForNewAssignment } from "@/services/planning/slot-rules";
import type { EstimatedDurationHours, ScheduleSlot, Team } from "@/types/domain";

export type CandidateSlot = {
  teamId: string;
  teamName: string;
  date: string;
  slot: ScheduleSlot;
};

/**
 * Créneaux libres compatibles avec la durée, pour la semaine (dates ISO jour).
 * Seules les dates à partir d'aujourd'hui sont proposées.
 */
export function buildAssignmentCandidates(
  weekDates: string[],
  teams: Team[],
  schedules: EnrichedScheduleRow[],
  estimatedHours: EstimatedDurationHours,
  fullDayThresholdHours: number
): CandidateSlot[] {
  const stateMap = buildDispatchStateMap(schedules);
  const slotTypes = slotsForNewAssignment(estimatedHours, fullDayThresholdHours);
  const needFullDay = slotTypes.length === 1 && slotTypes[0] === "full_day";

  /* Date d'aujourd'hui en ISO (YYYY-MM-DD) — comparaison de chaînes suffisante */
  const todayIso = new Date().toISOString().slice(0, 10);

  const activeTeams = teams.filter((t) => t.active);
  const candidates: CandidateSlot[] = [];

  for (const team of activeTeams) {
    for (const date of weekDates) {
      if (date < todayIso) continue;
      const state = getDayState(stateMap, team.id, date);

      if (needFullDay) {
        if (!state.fullDay && state.am.kind === "free" && state.pm.kind === "free") {
          candidates.push({
            teamId: team.id,
            teamName: team.name,
            date,
            slot: "full_day",
          });
        }
        continue;
      }

      if (!state.fullDay) {
        if (state.am.kind === "free") {
          candidates.push({ teamId: team.id, teamName: team.name, date, slot: "am" });
        }
        if (state.pm.kind === "free") {
          candidates.push({ teamId: team.id, teamName: team.name, date, slot: "pm" });
        }
      }
    }
  }

  return candidates;
}

/** Point de départ pour distance : bureau (AM / journée) ou job AM du même jour (PM). */
export function resolveOriginLatLng(
  candidate: CandidateSlot,
  schedules: EnrichedScheduleRow[],
  office: { lat: number; lng: number }
): { lat: number; lng: number } {
  if (candidate.slot === "am" || candidate.slot === "full_day") {
    return office;
  }

  const amRow = schedules.find(
    (s) =>
      s.status === "planned" &&
      s.team_id === candidate.teamId &&
      s.scheduled_date === candidate.date &&
      s.slot_type === "am"
  );

  const lat = amRow?.job?.clients?.lat;
  const lng = amRow?.job?.clients?.lng;
  if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return { lat, lng };
  }

  return office;
}
