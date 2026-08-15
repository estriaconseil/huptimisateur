"use server";

import { revalidatePath } from "next/cache";

import { runInterruptionBackup } from "@/features/interruption/run-backup";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";

type Err = { ok: false; message: string };

async function requireStaff() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "secretary")) {
    return null;
  }
  return profile;
}

export async function sendInterruptionBackupNow(): Promise<
  { ok: true; message: string } | Err
> {
  const profile = await requireStaff();
  if (!profile) return { ok: false, message: "Accès refusé" };

  const result = await runInterruptionBackup({ force: true });
  revalidatePath("/interruption");
  return {
    ok: result.ok,
    message: result.message,
  };
}

export async function updateInterruptionRecipients(
  recipientsRaw: string
): Promise<{ ok: true } | Err> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return { ok: false, message: "Seul un admin peut modifier les destinataires" };
  }

  const recipients = recipientsRaw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    return { ok: false, message: "Au moins un courriel requis" };
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const e of recipients) {
    if (!emailRe.test(e)) {
      return { ok: false, message: `Courriel invalide : ${e}` };
    }
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("interruption_settings")
    .upsert({
      id: 1,
      recipients,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    });

  if (error) return { ok: false, message: error.message };
  revalidatePath("/interruption");
  return { ok: true };
}
