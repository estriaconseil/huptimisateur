import { createServerSupabaseClient } from "@/lib/supabase/server";
import { VendeursManager } from "@/features/vendeurs/vendeurs-manager";
import type { Salesperson, SalespersonDayConfig } from "@/types/domain";

export type SalespersonWithDays = Salesperson & {
  salesperson_day_config: SalespersonDayConfig[];
};

export default async function VendeursPage() {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("salespeople")
    .select(`
      id, name, active, profile_id,
      home_address, home_lat, home_lng,
      notes, created_at,
      salesperson_day_config ( id, day_of_week, active, work_start_time, work_end_time )
    `)
    .order("name");

  const vendeurs = (data ?? []) as SalespersonWithDays[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Vendeurs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gérez les vendeurs et leurs plages horaires de travail
        </p>
      </div>

      <VendeursManager vendeurs={vendeurs as SalespersonWithDays[]} />
    </div>
  );
}
