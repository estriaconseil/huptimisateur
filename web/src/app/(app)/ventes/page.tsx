import { format, startOfWeek, parseISO } from "date-fns";

import { SalesCalendar } from "@/features/sales/sales-calendar";
import { loadSalesPageData } from "@/features/sales/load-sales-data";
import { defaultBusinessWeekMonday } from "@/lib/dispatch/business-week";
import { getCurrentSalespersonId } from "@/lib/supabase/profile";

type Props = {
  searchParams: Promise<{ week?: string; highlight?: string }>;
};

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function VentesPage({ searchParams }: Props) {
  const { week, highlight } = await searchParams;

  const monday =
    week && WEEK_RE.test(week)
      ? startOfWeek(parseISO(week), { weekStartsOn: 1 })
      : defaultBusinessWeekMonday();

  const weekStartLabel = format(monday, "yyyy-MM-dd");
  const currentSalespersonId = await getCurrentSalespersonId();
  const data = await loadSalesPageData(monday, currentSalespersonId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Calendrier des ventes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gérez les rendez-vous de l&apos;équipe de ventes
        </p>
      </div>

      <SalesCalendar
        data={data}
        weekStartLabel={weekStartLabel}
        highlightAppointmentId={typeof highlight === "string" ? highlight : null}
      />
    </div>
  );
}
