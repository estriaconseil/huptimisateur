import { LogOut } from "lucide-react";

import { signOutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function AppHeader() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="bg-background flex h-14 shrink-0 items-center justify-between border-b px-6">
      <p className="text-muted-foreground text-sm">
        {user?.email ? (
          <>
            Connecté : <span className="text-foreground font-medium">{user.email}</span>
          </>
        ) : (
          "Session"
        )}
      </p>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" size="sm" className="gap-1.5">
          <LogOut className="size-3.5" aria-hidden />
          Déconnexion
        </Button>
      </form>
    </header>
  );
}
