import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/domain";

/** Routes accessibles aux vendeurs — doit rester synchronisé avec proxy.ts */
const SALESPERSON_ALLOWED = ["/ventes", "/clients", "/nouveau"];

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

  if (!profile?.role) {
    redirect("/login");
  }

  const role = profile.role as UserRole;

  // ── Protection des routes pour les vendeurs ─────────────────────────────
  // Le proxy injecte x-pathname. Si absent → fail-closed hors /ventes.
  if (role === "salesperson") {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") ?? "";

    const allowed =
      !!pathname &&
      SALESPERSON_ALLOWED.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      );
    if (!allowed) {
      redirect("/ventes");
    }
  }

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
