import { TeamsManager } from "@/features/teams/teams-manager";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Team, Technician } from "@/types/domain";

type TeamRow = Team & {
  team_technicians: { technicians: Technician | null }[];
};

export default async function EquipesPage() {
  const supabase = await createServerSupabaseClient();
  const profile = await getCurrentProfile();

  const { data: teamsRaw, error } = await supabase
    .from("teams")
    .select(
      `id, name, active, color, notes, created_at,
       team_technicians ( technicians ( id, first_name, last_name, email, phone, active, created_at ) )`
    )
    .order("name");

  const { data: techsRaw } = await supabase
    .from("technicians")
    .select("id, first_name, last_name, email, phone, active, created_at")
    .order("last_name")
    .order("first_name");

  const allTechnicians: Technician[] = (techsRaw ?? []) as Technician[];

  const teams = (teamsRaw ?? []).map((row: unknown) => {
    const r = row as TeamRow;
    return {
      id: r.id,
      name: r.name,
      active: r.active,
      color: r.color,
      notes: r.notes,
      created_at: r.created_at,
      technicians: (r.team_technicians ?? [])
        .map((tt) => tt.technicians)
        .filter((t): t is Technician => t !== null),
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipes</h1>
        <p className="text-muted-foreground text-sm">
          Gestion des equipes terrain. Les equipes inactives restent visibles au calendrier,
          grises. Clique sur l&apos;icone{" "}
          <strong>Techniciens</strong> pour assigner les membres de chaque equipe.
        </p>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          Impossible de charger les equipes : {error.message}
        </p>
      )}

      {profile ? (
        <TeamsManager teams={teams} allTechnicians={allTechnicians} role={profile.role} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Profil introuvable. Deconnecte-toi et reconnecte-toi.
        </p>
      )}
    </div>
  );
}
