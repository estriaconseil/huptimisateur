import type { EstimatedDurationHours, ScheduleSlot } from "@/types/domain";

/**
 * Une job bloque la journée entière si sa durée >= seuil paramétré (défaut 8 h).
 * MVP : 4 h → demi-journée (AM ou PM), 8 h → journée complète (AM + PM bloqués).
 */
export function jobBlocksFullDay(
  estimatedHours: number,
  fullDayThresholdHours: number
): boolean {
  return estimatedHours >= fullDayThresholdHours;
}

/** Créneaux possibles pour une nouvelle affectation (hors conflits calendrier). */
export function slotsForNewAssignment(
  estimatedHours: EstimatedDurationHours,
  fullDayThresholdHours: number
): ScheduleSlot[] {
  if (jobBlocksFullDay(estimatedHours, fullDayThresholdHours)) {
    return ["full_day"];
  }
  return ["am", "pm"];
}

/** Libellé UI pour les secrétaires */
export function slotLabel(slot: ScheduleSlot): string {
  switch (slot) {
    case "am":
      return "AM";
    case "pm":
      return "PM";
    case "full_day":
      return "Journée";
    default:
      return slot;
  }
}
