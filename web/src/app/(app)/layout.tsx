import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/domain";

export default async function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role ?? "secretary") as UserRole;

  return (
    <div className="flex min-h-svh">
      <AppSidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="bg-muted/30 flex-1 overflow-auto p-6 print:bg-white print:p-0">{children}</main>
      </div>
    </div>
  );
}
