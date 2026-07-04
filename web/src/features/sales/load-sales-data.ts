/** Chargement de données serveur uniquement — ne pas importer dans les composants client. */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBusinessWeekDateStrings } from "@/lib/dispatch/business-week";
import type { SalesPageData, SalespersonForCalendar, BlockRow } from "./sales-utils";

export type { SalesPageData };

export async function loadSalesPageData(monday: Date): Promise<SalesPageData> {
  const supabase = await createServerSupabaseClient();
  const weekDates = getBusinessWeekDateStrings(monday);

  const [{ data: activeSalespeople }, { data: appointments }, { data: rawBlocks }] = await Promise.all([
    supabase
      .from("salespeople")
      .select(`
        id, name, active, profile_id,
        home_address, home_lat, home_lng,
        notes, created_at,
        salesperson_day_config ( day_of_week, active, work_start_time, work_end_time )
      `)
      .eq("active", true)
      .order("name"),

    supabase
      .from("sales_appointments")
      .select("id, salesperson_id, client_name, client_phone, client_address, client_lat, client_lng, scheduled_date, start_time, status, notes, quote_id")
      .gte("scheduled_date", weekDates[0])
      .lte("scheduled_date", weekDates[weekDates.length - 1])
      .neq("status", "cancelled"),

    supabase
      .from("salesperson_blocks")
      .select("id, salesperson_id, block_type, start_date, end_date, start_time, end_time, notes")
      .lte("start_date", weekDates[weekDates.length - 1])
      .gte("end_date", weekDates[0]),
  ]);

  const activeIds = new Set((activeSalespeople ?? []).map((sp) => sp.id as string));

  // Trouver les vendeurs inactifs qui ont quand même des RDV cette semaine
  const inactiveSpIds = [
    ...new Set(
      (appointments ?? [])
        .map((a) => a.salesperson_id as string)
        .filter((id) => !activeIds.has(id))
    ),
  ];

  let inactiveSalespeople: SalespersonForCalendar[] = [];
  if (inactiveSpIds.length > 0) {
    const { data } = await supabase
      .from("salespeople")
      .select(`
        id, name, active, profile_id,
        home_address, home_lat, home_lng,
        notes, created_at,
        salesperson_day_config ( day_of_week, active, work_start_time, work_end_time )
      `)
      .in("id", inactiveSpIds)
      .order("name");
    inactiveSalespeople = (data ?? []) as SalespersonForCalendar[];
  }

  // Actifs en premier, inactifs (avec RDV cette semaine) à la fin
  const salespeople = [
    ...(activeSalespeople ?? []) as SalespersonForCalendar[],
    ...inactiveSalespeople,
  ];

  return {
    salespeople,
    appointments: (appointments ?? []).map((a) => ({
      ...a,
      start_time: (a.start_time as string).slice(0, 5),
    })),
    blocks: (rawBlocks ?? []) as BlockRow[],
    weekDates,
  };
}
