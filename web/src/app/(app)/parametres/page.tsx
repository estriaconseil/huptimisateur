import { SettingsForm } from "@/features/settings/settings-form";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppSettings } from "@/types/domain";

export default async function ParametresPage() {
  const supabase = await createServerSupabaseClient();
  const profile = await getCurrentProfile();

  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  const settings = data as AppSettings | null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground text-sm">
          Adresse du bureau, horaires AM/PM et seuil de blocage journée complète.
        </p>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          Erreur : {error.message}
        </p>
      )}

      {profile ? (
        <SettingsForm settings={settings} role={profile.role} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Profil introuvable. Déconnecte-toi et reconnecte-toi.
        </p>
      )}
    </div>
  );
}
