import { redirect } from "next/navigation";

import { InterruptionClient } from "@/features/interruption/interruption-client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function InterruptionPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin" && profile.role !== "secretary") {
    redirect("/");
  }

  const supabase = await createServerSupabaseClient();

  const [{ data: settings }, { data: lastRun }] = await Promise.all([
    supabase.from("interruption_settings").select("recipients").eq("id", 1).maybeSingle(),
    supabase
      .from("interruption_runs")
      .select(
        "generated_at, period_start, period_end, status, email_status, error_message, recipient_count, is_retry"
      )
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const recipients =
    (settings?.recipients as string[] | null)?.length
      ? (settings!.recipients as string[])
      : ["optimisateurhuppe@gmail.com"];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Interruption</h1>
        <p className="text-muted-foreground text-sm">
          PDF de secours des horaires — téléchargement, envoi manuel et statut du cron 6h.
        </p>
      </div>

      <InterruptionClient
        isAdmin={profile.role === "admin"}
        recipients={recipients}
        lastRun={
          lastRun
            ? {
                generated_at: lastRun.generated_at as string,
                period_start: lastRun.period_start as string,
                period_end: lastRun.period_end as string,
                status: lastRun.status as string,
                email_status: (lastRun.email_status as string | null) ?? null,
                error_message: (lastRun.error_message as string | null) ?? null,
                recipient_count: (lastRun.recipient_count as number) ?? 0,
                is_retry: Boolean(lastRun.is_retry),
              }
            : null
        }
      />
    </div>
  );
}
