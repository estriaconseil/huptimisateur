import { createServerSupabaseClient } from "@/lib/supabase/server";
import { VendeursManager } from "@/features/vendeurs/vendeurs-manager";
import type { Salesperson, SalespersonDayConfig } from "@/types/domain";

export type SalespersonWithDays = Salesperson & {
  salesperson_day_config: SalespersonDayConfig[];
};

export type SalespersonProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export default async function VendeursPage() {
  const supabase = await createServerSupabaseClient();

  const [{ data }, { data: profilesData }] = await Promise.all([
    supabase
      .from("salespeople")
      .select(`
        id, name, active, profile_id,
        home_address, home_lat, home_lng,
        notes, created_at,
        salesperson_day_config ( id, day_of_week, active, work_start_time, work_end_time )
      `)
      .order("name"),

    // Tous les comptes avec le rôle vendeur — pour le menu de liaison
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "salesperson")
      .order("full_name"),
  ]);

  const vendeurs = (data ?? []) as SalespersonWithDays[];
  const profiles = (profilesData ?? []) as SalespersonProfile[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Vendeurs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gérez les vendeurs et leurs plages horaires de travail
        </p>
      </div>

      <VendeursManager vendeurs={vendeurs as SalespersonWithDays[]} profiles={profiles} />
    </div>
  );
}
