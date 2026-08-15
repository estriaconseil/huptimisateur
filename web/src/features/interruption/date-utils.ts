import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";

/** « Aujourd'hui » en fuseau Québec (yyyy-MM-dd). */
export function torontoTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Heure 0–23 à Toronto. */
export function torontoHour(now = new Date()): number {
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  return Number(raw);
}

/** Jour de semaine Toronto : 1=lun … 7=dim (ISO). */
export function torontoWeekdayIso(now = new Date()): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    weekday: "short",
  }).format(now);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[wd] ?? 0;
}

/**
 * Plage PDF : lun–ven semaine courante + lun–ven semaine suivante (Toronto).
 */
export function getBackupPeriod(now = new Date()): {
  periodStart: string;
  periodEnd: string;
  week1Start: string;
  week1End: string;
  week2Start: string;
  week2End: string;
  week1Label: string;
  week2Label: string;
  businessDates: string[];
} {
  const todayIso = torontoTodayIso(now);
  const monday = startOfWeek(parseISO(todayIso), { weekStartsOn: 1 });
  const week1Start = monday;
  const week1End = addDays(monday, 4);
  const week2Start = addDays(monday, 7);
  const week2End = addDays(monday, 11);

  const businessDates: string[] = [];
  for (const base of [monday, week2Start]) {
    for (let i = 0; i < 5; i++) {
      businessDates.push(format(addDays(base, i), "yyyy-MM-dd"));
    }
  }

  const label = (a: Date, b: Date) =>
    `${format(a, "d MMM", { locale: fr })} – ${format(b, "d MMM yyyy", { locale: fr })}`;

  return {
    periodStart: format(week1Start, "yyyy-MM-dd"),
    periodEnd: format(week2End, "yyyy-MM-dd"),
    week1Start: format(week1Start, "yyyy-MM-dd"),
    week1End: format(week1End, "yyyy-MM-dd"),
    week2Start: format(week2Start, "yyyy-MM-dd"),
    week2End: format(week2End, "yyyy-MM-dd"),
    week1Label: label(week1Start, week1End),
    week2Label: label(week2Start, week2End),
    businessDates,
  };
}

export function formatDayHeading(isoDate: string): string {
  return format(parseISO(isoDate), "EEEE d MMMM yyyy", { locale: fr });
}
