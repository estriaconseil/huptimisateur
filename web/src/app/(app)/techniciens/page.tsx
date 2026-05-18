import { TechniciansManager } from "@/features/technicians/technicians-manager";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Technician } from "@/types/domain";

export default async function TechniciensPage() {
  const supabase = await createServerSupabaseClient();
  const profile = await getCurrentProfile();

  const { data: raw, error } = await supabase
    .from("technicians")
    .select("id, first_name, last_name, email, phone, active, created_at")
    .order("last_name")
    .order("first_name");

  const technicians: Technician[] = (raw ?? []) as Technician[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Techniciens</h1>
        <p className="text-muted-foreground text-sm">
          Gestion des techniciens terrain. Assigne-les aux equipes depuis la page{" "}
          <strong>Equipes</strong>.
        </p>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          Impossible de charger les techniciens : {error.message}
        </p>
      )}

      {profile ? (
        <TechniciansManager technicians={technicians} role={profile.role} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Profil introuvable. Deconnecte-toi et reconnecte-toi.
        </p>
      )}
    </div>
  );
}
