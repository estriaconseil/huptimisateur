"use server";

import { getDay, parse } from "date-fns";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jobBlocksFullDay } from "@/services/planning/slot-rules";
import type { ScheduleSlot } from "@/types/domain";

function isWeekendYmd(ymd: string): boolean {
  const d = parse(ymd, "yyyy-MM-dd", new Date());
  const day = getDay(d);
  return day === 0 || day === 6;
}

export async function assignJobToSlot(input: {
  jobId: string;
  teamId: string;
  scheduledDate: string;
  half: "am" | "pm";
  fullDayThresholdHours: number;
  estimatedDurationHours: number;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, message: "Non authentifié" };
  }

  if (isWeekendYmd(input.scheduledDate)) {
    return {
      ok: false as const,
      message: "Les interventions ne sont pas planifiées le samedi ni le dimanche.",
    };
  }

  const long = jobBlocksFullDay(input.estimatedDurationHours, input.fullDayThresholdHours);
  const slot_type: ScheduleSlot = long ? "full_day" : input.half;

  const { error } = await supabase.from("schedules").insert({
    job_id: input.jobId,
    team_id: input.teamId,
    scheduled_date: input.scheduledDate,
    slot_type,
    status: "planned",
  });

  if (error) {
    return { ok: false as const, message: error.message };
  }

  const { error: jobErr } = await supabase
    .from("jobs")
    .update({ status: "reparti" })
    .eq("id", input.jobId);

  if (jobErr) {
    console.error("[assignJobToSlot] Impossible de mettre à jour le statut de la job :", jobErr.message);
  }

  revalidatePath("/dispatch");
  revalidatePath("/a-planifier");
  return { ok: true as const };
}

export async function removeSchedule(scheduleId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, message: "Non authentifié" };
  }

  const { data: row, error: fetchErr } = await supabase
    .from("schedules")
    .select("job_id")
    .eq("id", scheduleId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false as const, message: fetchErr?.message ?? "Créneau introuvable" };
  }

  const { error } = await supabase.from("schedules").delete().eq("id", scheduleId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  const { count } = await supabase
    .from("schedules")
    .select("*", { count: "exact", head: true })
    .eq("job_id", row.job_id)
    .eq("status", "planned");

  if ((count ?? 0) === 0) {
    await supabase.from("jobs").update({ status: "a_planifier" }).eq("id", row.job_id);
  }

  revalidatePath("/dispatch");
  return { ok: true as const };
}
