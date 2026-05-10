import type { EstimatedDurationHours, ScheduleSlot } from "@/types/domain";

/**
 * Une job bloque la journée entière si sa durée >= seuil paramétré (défaut 6 h).
 * En MVP métier fixe : durées 6 h et 8 h → alignez le seuil à 6 dans app_settings.
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
