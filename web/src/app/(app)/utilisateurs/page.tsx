import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { UsersManager } from "@/features/users/users-manager";
import type { AdminUserRow } from "@/actions/admin-users";

export default async function UtilisateursPage() {
  const profile = await getCurrentProfile();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: true });

  const users = (data ?? []) as AdminUserRow[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Utilisateurs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gérez les comptes, les rôles et les mots de passe.
        </p>
      </div>

      <UsersManager users={users} />
    </div>
  );
}
