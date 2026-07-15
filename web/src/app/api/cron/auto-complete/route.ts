import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Vercel Cron — s'exécute à 8h00 UTC (4h00 EST) chaque matin.
 * Passe les jobs "reparti" en "termine" si leur DERNIÈRE date d'installation
 * dans schedule_rows est passée (avant aujourd'hui).
 *
 * Protégé par le header Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  // Trouver tous les jobs "reparti" dont la dernière date planifiée est passée
  const { data: candidates, error: fetchErr } = await supabase
    .from("schedules")
    .select("job_id, scheduled_date")
    .eq("status", "planned")
    .order("scheduled_date", { ascending: false });

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  // Grouper par job_id → prendre la date MAX par job
  const latestByJob = new Map<string, string>();
  for (const row of (candidates ?? [])) {
    const existing = latestByJob.get(row.job_id);
    if (!existing || row.scheduled_date > existing) {
      latestByJob.set(row.job_id, row.scheduled_date);
    }
  }

  // Ne garder que les jobs dont la dernière date est strictement avant aujourd'hui
  const jobIdsToComplete = [...latestByJob.entries()]
    .filter(([, date]) => date < today)
    .map(([jobId]) => jobId);

  if (jobIdsToComplete.length === 0) {
    return NextResponse.json({ updated: 0, message: "Aucun job à terminer." });
  }

  // Vérifier que ces jobs sont bien en statut "reparti"
  const { data: repartiJobs, error: checkErr } = await supabase
    .from("jobs")
    .select("id")
    .in("id", jobIdsToComplete)
    .eq("status", "reparti");

  if (checkErr) {
    return NextResponse.json({ error: checkErr.message }, { status: 500 });
  }

  const idsToUpdate = (repartiJobs ?? []).map((j) => j.id);
  if (idsToUpdate.length === 0) {
    return NextResponse.json({ updated: 0, message: "Aucun job reparti éligible." });
  }

  const { error: updateErr } = await supabase
    .from("jobs")
    .update({ status: "termine" })
    .in("id", idsToUpdate);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    updated: idsToUpdate.length,
    jobIds: idsToUpdate,
    message: `${idsToUpdate.length} job(s) passé(s) en 'termine'.`,
  });
}
