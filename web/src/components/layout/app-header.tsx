import { HeaderUserMenu } from "@/components/layout/header-user-menu";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function AppHeader() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="bg-background flex h-14 shrink-0 items-center justify-end border-b px-6 print:hidden">
      {user?.email && <HeaderUserMenu email={user.email} />}
    </header>
  );
}
