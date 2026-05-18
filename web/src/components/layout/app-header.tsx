import { LogOut } from "lucide-react";

import { signOutAction } from "@/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function AppHeader() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = await getCurrentProfile();

  return (
    <header className="bg-background flex h-14 shrink-0 items-center justify-between border-b px-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {user?.email ? (
          <>
            <span className="text-muted-foreground">
              Connecté : <span className="text-foreground font-medium">{user.email}</span>
            </span>
            {profile?.role && (
              <Badge variant={profile.role === "admin" ? "default" : "secondary"} className="text-xs">
                {profile.role === "admin" ? "Admin" : "Secrétaire"}
              </Badge>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Session</span>
        )}
      </div>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" size="sm" className="gap-1.5">
          <LogOut className="size-3.5" aria-hidden />
          Déconnexion
        </Button>
      </form>
    </header>
  );
}
