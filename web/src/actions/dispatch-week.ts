"use server";

import { loadDispatchPageData } from "@/features/dispatch/load-dispatch-data";

/** Occupancy d'une semaine dispatch — pour l'onglet calendrier du dashboard installation. */
export async function getInstallWeekGrid(weekStartIso?: string) {
  const data = await loadDispatchPageData(weekStartIso);
  return {
    ok: true as const,
    weekDates: data.weekDates,
    weekStartLabel: data.weekStartLabel,
    teams: data.teams.filter((t) => t.active),
    schedules: data.schedules,
  };
}
