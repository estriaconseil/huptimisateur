import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import React, { type ReactElement } from "react";
import { Resend } from "resend";

import { BackupDocument } from "@/features/interruption/BackupDocument";
import { getBackupPeriod, torontoTodayIso } from "@/features/interruption/date-utils";
import { loadBackupPayload } from "@/features/interruption/load-backup-data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "interruption-backups";
const STORAGE_PATH = "latest/horaires-secours.pdf";

export type BackupRunResult = {
  ok: boolean;
  message: string;
  periodStart?: string;
  periodEnd?: string;
  emailStatus?: string;
  storagePath?: string;
  runId?: string;
};

async function getRecipients(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<string[]> {
  const { data } = await supabase
    .from("interruption_settings")
    .select("recipients")
    .eq("id", 1)
    .maybeSingle();
  const list = (data?.recipients as string[] | null) ?? [];
  const cleaned = list.map((e) => e.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["optimisateurhuppe@gmail.com"];
}

/** Garde uniquement le dernier run en base. */
async function pruneOldRuns(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  keepId: string
) {
  await supabase.from("interruption_runs").delete().neq("id", keepId);
}

export async function runInterruptionBackup(opts?: {
  isRetry?: boolean;
  /** Ignore le garde-fou « déjà envoyé aujourd'hui » */
  force?: boolean;
}): Promise<BackupRunResult> {
  const supabase = createAdminSupabaseClient();
  const now = new Date();
  const today = torontoTodayIso(now);
  const isRetry = opts?.isRetry ?? false;
  const force = opts?.force ?? false;

  if (!force) {
    const { data: last } = await supabase
      .from("interruption_runs")
      .select("id, generated_at, email_status, status")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (last) {
      const lastDay = torontoTodayIso(new Date(last.generated_at as string));
      if (lastDay === today && last.email_status === "sent" && !isRetry) {
        return {
          ok: true,
          message: "PDF déjà envoyé aujourd'hui — ignoré.",
          emailStatus: "skipped",
        };
      }
      if (isRetry && lastDay === today && last.email_status === "sent") {
        return {
          ok: true,
          message: "Retry inutile — envoi déjà réussi aujourd'hui.",
          emailStatus: "skipped",
        };
      }
      if (isRetry && lastDay === today && last.email_status !== "failed") {
        // Pas d'échec à retenter
        if (last.email_status === "sent") {
          return { ok: true, message: "Rien à retenter.", emailStatus: "skipped" };
        }
      }
    }
  }

  const period = getBackupPeriod(now);
  const payload = await loadBackupPayload(supabase, now);

  let pdfBuffer: Buffer;
  try {
    const element = React.createElement(BackupDocument, {
      data: payload,
    }) as ReactElement<DocumentProps>;
    pdfBuffer = Buffer.from(await renderToBuffer(element));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur rendu PDF";
    const { data: failRun } = await supabase
      .from("interruption_runs")
      .insert({
        period_start: period.periodStart,
        period_end: period.periodEnd,
        status: "failed",
        email_status: "skipped",
        error_message: msg,
        is_retry: isRetry,
      })
      .select("id")
      .single();
    if (failRun?.id) await pruneOldRuns(supabase, failRun.id);
    return { ok: false, message: msg };
  }

  // Upload Storage (écrase latest)
  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(STORAGE_PATH, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (upErr) {
    const { data: failRun } = await supabase
      .from("interruption_runs")
      .insert({
        period_start: period.periodStart,
        period_end: period.periodEnd,
        status: "failed",
        email_status: "skipped",
        error_message: `Storage: ${upErr.message}`,
        is_retry: isRetry,
        file_bytes: pdfBuffer.length,
      })
      .select("id")
      .single();
    if (failRun?.id) await pruneOldRuns(supabase, failRun.id);
    return { ok: false, message: `Storage: ${upErr.message}` };
  }

  const recipients = await getRecipients(supabase);
  const subject = `Huppé — horaires secours ${period.week1Start}–${period.week2End}`;
  const filename = `horaires-secours-${period.periodStart}_${period.periodEnd}.pdf`;

  let emailStatus: "sent" | "failed" | "skipped" = "skipped";
  let errorMessage: string | null = null;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    emailStatus = "failed";
    errorMessage = "RESEND_API_KEY manquante";
  } else {
    try {
      const resend = new Resend(apiKey);
      const from =
        process.env.RESEND_FROM_EMAIL ??
        "Huppé Réfrigération <onboarding@resend.dev>";
      const { error: sendError } = await resend.emails.send({
        from,
        to: recipients,
        subject,
        text:
          `Horaires de secours Huppé (semaines ${period.week1Label} et ${period.week2Label}).\n` +
          `Document joint — à utiliser si Huptimisateur est indisponible.\n` +
          `Généré automatiquement.`,
        attachments: [
          {
            filename,
            content: pdfBuffer,
          },
        ],
      });
      if (sendError) {
        emailStatus = "failed";
        errorMessage = sendError.message;
      } else {
        emailStatus = "sent";
      }
    } catch (e) {
      emailStatus = "failed";
      errorMessage = e instanceof Error ? e.message : "Erreur Resend";
    }
  }

  const status = emailStatus === "sent" ? "emailed" : "stored";
  const { data: run, error: runErr } = await supabase
    .from("interruption_runs")
    .insert({
      period_start: period.periodStart,
      period_end: period.periodEnd,
      status,
      email_status: emailStatus,
      error_message: errorMessage,
      storage_path: STORAGE_PATH,
      file_bytes: pdfBuffer.length,
      recipient_count: recipients.length,
      is_retry: isRetry,
    })
    .select("id")
    .single();

  if (run?.id) await pruneOldRuns(supabase, run.id);

  if (runErr) {
    return {
      ok: emailStatus === "sent",
      message: `PDF ok mais run DB: ${runErr.message}`,
      emailStatus,
      storagePath: STORAGE_PATH,
    };
  }

  if (emailStatus === "failed") {
    return {
      ok: true,
      message: `PDF stocké, envoi courriel échoué: ${errorMessage}`,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      emailStatus,
      storagePath: STORAGE_PATH,
      runId: run?.id,
    };
  }

  return {
    ok: true,
    message: `PDF généré et envoyé à ${recipients.join(", ")}`,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    emailStatus,
    storagePath: STORAGE_PATH,
    runId: run?.id,
  };
}

export async function downloadLatestBackupPdf(): Promise<
  { ok: true; buffer: Buffer; filename: string } | { ok: false; message: string }
> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(STORAGE_PATH);

  if (error || !data) {
    // Générer à la volée si rien en storage
    const payload = await loadBackupPayload(supabase);
    const period = getBackupPeriod();
    try {
      const element = React.createElement(BackupDocument, {
        data: payload,
      }) as ReactElement<DocumentProps>;
      const pdfBuffer = Buffer.from(await renderToBuffer(element));
      return {
        ok: true,
        buffer: pdfBuffer,
        filename: `horaires-secours-${period.periodStart}_${period.periodEnd}.pdf`,
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "PDF introuvable",
      };
    }
  }

  const buf = Buffer.from(await data.arrayBuffer());
  const { data: last } = await supabase
    .from("interruption_runs")
    .select("period_start, period_end")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const filename = last
    ? `horaires-secours-${last.period_start}_${last.period_end}.pdf`
    : "horaires-secours.pdf";

  return { ok: true, buffer: buf, filename };
}

export { STORAGE_PATH, STORAGE_BUCKET };
