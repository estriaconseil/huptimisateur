import { startOfWeek, parseISO } from "date-fns";

import { SalesCalendar } from "@/features/sales/sales-calendar";
import { loadSalesPageData } from "@/features/sales/load-sales-data";
import { defaultBusinessWeekMonday } from "@/lib/dispatch/business-week";

type Props = {
  searchParams: Promise<{ week?: string }>;
};

export default async function VentesPage({ searchParams }: Props) {
  const { week } = await searchParams;

  const monday = week
    ? startOfWeek(parseISO(week), { weekStartsOn: 1 })
    : defaultBusinessWeekMonday();

  const data = await loadSalesPageData(monday);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Calendrier des ventes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gérez les rendez-vous de l&apos;équipe de ventes
        </p>
      </div>

      <SalesCalendar data={data} monday={monday} />
    </div>
  );
}
