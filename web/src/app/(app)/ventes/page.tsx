import { startOfWeek, addWeeks, getDay, parseISO } from "date-fns";

import { SalesCalendar } from "@/features/sales/sales-calendar";
import { loadSalesPageData } from "@/features/sales/load-sales-data";

type Props = {
  searchParams: Promise<{ week?: string }>;
};

export default async function VentesPage({ searchParams }: Props) {
  const { week } = await searchParams;

  const today = new Date();
  // Sam/Dim → afficher la semaine suivante (la semaine en cours est terminée)
  const dow = getDay(today);
  const defaultBase = dow === 0 || dow === 6 ? addWeeks(today, 1) : today;
  const monday = week
    ? startOfWeek(parseISO(week), { weekStartsOn: 1 })
    : startOfWeek(defaultBase, { weekStartsOn: 1 });

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
