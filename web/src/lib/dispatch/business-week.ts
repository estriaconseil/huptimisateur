import { addDays, addWeeks, format, getDay, startOfWeek } from "date-fns";

/** Vue dispatch : jours ouvrables uniquement (lun–ven). Pas de colonnes weekend. */
export const BUSINESS_DAY_COUNT = 5;

export function getBusinessWeekDateStrings(monday: Date): string[] {
  const dates: string[] = [];
  for (let d = 0; d < BUSINESS_DAY_COUNT; d++) {
    dates.push(format(addDays(monday, d), "yyyy-MM-dd"));
  }
  return dates;
}

/**
 * Lundi de la semaine à afficher par défaut.
 * Samedi / dimanche → semaine suivante (la semaine en cours est terminée).
 */
export function defaultBusinessWeekMonday(from = new Date()): Date {
  const dow = getDay(from);
  const base = dow === 0 || dow === 6 ? addWeeks(from, 1) : from;
  return startOfWeek(base, { weekStartsOn: 1 });
}
