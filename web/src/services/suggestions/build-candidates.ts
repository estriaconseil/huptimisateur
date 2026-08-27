import {
  buildDispatchStateMap,
  getDayState,
  type EnrichedScheduleRow,
} from "@/services/planning/dispatch-state";
import { slotsForNewAssignment } from "@/services/planning/slot-rules";
import type { EstimatedDurationHours, ScheduleSlot, Team, TeamBlock } from "@/types/domain";

export function isTeamSlotBlocked(
  blocks: TeamBlock[],
  teamId: string,
  date: string,
  slot: ScheduleSlot
): boolean {
  for (const b of blocks) {
    if (b.team_id !== teamId || b.blocked_date !== date) continue;
    if (b.slot_type === "full_day") return true;
    if (b.slot_type === slot) return true;
    if (slot === "full_day" && (b.slot_type === "am" || b.slot_type === "pm")) return true;
  }
  return false;
}

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
  fullDayThresholdHours: number,
  teamBlocks: TeamBlock[] = []
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
          if (!isTeamSlotBlocked(teamBlocks, team.id, date, "full_day")) {
            candidates.push({
              teamId: team.id,
              teamName: team.name,
              date,
              slot: "full_day",
            });
          }
        }
        continue;
      }

      if (!state.fullDay) {
        if (state.am.kind === "free" && !isTeamSlotBlocked(teamBlocks, team.id, date, "am")) {
          candidates.push({ teamId: team.id, teamName: team.name, date, slot: "am" });
        }
        if (state.pm.kind === "free" && !isTeamSlotBlocked(teamBlocks, team.id, date, "pm")) {
          candidates.push({ teamId: team.id, teamName: team.name, date, slot: "pm" });
        }
      }
    }
  }

  return candidates;
}

function clientCoords(
  row: EnrichedScheduleRow | undefined
): { lat: number; lng: number } | null {
  const lat = row?.job?.installation_address?.lat;
  const lng = row?.job?.installation_address?.lng;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }
  return { lat, lng };
}

/**
 * Point de référence pour le score distance :
 * - AM libre + job PM le même jour → coords de la job PM (cohérence de journée)
 * - PM libre + job AM le même jour → coords de la job AM
 * - sinon → bureau (départ de journée / journée complète)
 */
export function resolveOriginLatLng(
  candidate: CandidateSlot,
  schedules: EnrichedScheduleRow[],
  office: { lat: number; lng: number }
): { lat: number; lng: number } {
  const sameDay = (slotType: EnrichedScheduleRow["slot_type"]) =>
    schedules.find(
      (s) =>
        s.status === "planned" &&
        s.team_id === candidate.teamId &&
        s.scheduled_date === candidate.date &&
        s.slot_type === slotType
    );

  if (candidate.slot === "am") {
    return clientCoords(sameDay("pm")) ?? office;
  }

  if (candidate.slot === "pm") {
    return clientCoords(sameDay("am")) ?? office;
  }

  return office;
}
