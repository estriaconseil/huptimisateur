import { addDays, format } from "date-fns";

/** Vue dispatch : jours ouvrables uniquement (lun–ven). Pas de colonnes weekend. */
export const BUSINESS_DAY_COUNT = 5;

export function getBusinessWeekDateStrings(monday: Date): string[] {
  const dates: string[] = [];
  for (let d = 0; d < BUSINESS_DAY_COUNT; d++) {
    dates.push(format(addDays(monday, d), "yyyy-MM-dd"));
  }
  return dates;
}
