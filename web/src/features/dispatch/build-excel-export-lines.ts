import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

import { cityFromAddress } from "@/lib/address";
import type { EnrichedScheduleRow } from "@/services/planning/dispatch-state";

export type ExcelExportDay = {
  date: string;
  heading: string;
  lines: string[];
};

type JobKey = string; // `${date}|${normalizedName}`

/**
 * Construit le texte « Excel » pour une semaine d'install :
 * une ligne par job → `Nom AM|PM|AM-PM Ville`
 * Même client AM+PM le même jour → une seule ligne AM-PM.
 */
export function buildInstallWeekExcelExport(
  weekDates: string[],
  schedules: EnrichedScheduleRow[]
): ExcelExportDay[] {
  const planned = schedules.filter((s) => s.status === "planned" && s.job);

  type Acc = {
    name: string;
    city: string | null;
    am: boolean;
    pm: boolean;
  };

  const byDay = new Map<string, Map<JobKey, Acc>>();

  for (const date of weekDates) {
    byDay.set(date, new Map());
  }

  for (const row of planned) {
    if (!weekDates.includes(row.scheduled_date)) continue;
    const name = (row.job?.clients?.name ?? "Client").trim() || "Client";
    const city =
      row.job?.installation_address?.city?.trim() ||
      row.job?.clients?.city?.trim() ||
      cityFromAddress(row.job?.installation_address?.address_formatted) ||
      cityFromAddress(row.job?.clients?.address_formatted) ||
      null;
    const key = `${row.scheduled_date}|${name.toLowerCase()}`;
    const dayMap = byDay.get(row.scheduled_date);
    if (!dayMap) continue;

    let entry = dayMap.get(key);
    if (!entry) {
      entry = {
        name,
        city,
        am: false,
        pm: false,
      };
      dayMap.set(key, entry);
    }
    if (city && !entry.city) entry.city = city;

    if (row.slot_type === "full_day") {
      entry.am = true;
      entry.pm = true;
    } else if (row.slot_type === "am") {
      entry.am = true;
    } else if (row.slot_type === "pm") {
      entry.pm = true;
    }
  }

  return weekDates.map((date) => {
    const entries = Array.from(byDay.get(date)?.values() ?? []);
    // Ordre stable : AM-only, puis AM-PM, puis PM-only ; alpha dans chaque groupe
    entries.sort((a, b) => {
      const rank = (e: Acc) => (e.am && e.pm ? 1 : e.am ? 0 : 2);
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return a.name.localeCompare(b.name, "fr");
    });

    const lines = entries.map((e) => {
      const slot = e.am && e.pm ? "AM-PM" : e.am ? "AM" : "PM";
      return e.city ? `${e.name} ${slot} ${e.city}` : `${e.name} ${slot}`;
    });

    return {
      date,
      heading: format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr }),
      lines,
    };
  });
}

/** Texte brut (une ligne = une job), prêt à coller dans Excel. */
export function excelExportToPlainText(
  days: ExcelExportDay[],
  weekLabel: string
): string {
  const parts: string[] = [`Installations — ${weekLabel}`, ""];
  for (const day of days) {
    parts.push(day.heading);
    if (day.lines.length === 0) {
      parts.push("(aucune job)");
    } else {
      parts.push(...day.lines);
    }
    parts.push("");
  }
  return parts.join("\n").trimEnd() + "\n";
}
