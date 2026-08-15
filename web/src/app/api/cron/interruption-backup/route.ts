import { NextRequest, NextResponse } from "next/server";

import {
  torontoHour,
  torontoWeekdayIso,
} from "@/features/interruption/date-utils";
import { runInterruptionBackup } from "@/features/interruption/run-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron Vercel — Lun–Ven à 10:00 et 11:00 UTC.
 * Ne s'exécute vraiment que si l'heure à Toronto est 6h (envoi) ou 7h (retry).
 * Protégé par Authorization: Bearer CRON_SECRET.
 *
 * Note : si Vercel est down, le dernier PDF reste dans Supabase Storage
 * (bucket interruption-backups) et dans la boîte courriel de la veille.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const wd = torontoWeekdayIso(now);
  if (wd < 1 || wd > 5) {
    return NextResponse.json({ ok: true, skipped: true, reason: "weekend" });
  }

  const hour = torontoHour(now);
  if (hour === 6) {
    const result = await runInterruptionBackup({ isRetry: false });
    return NextResponse.json(result);
  }
  if (hour === 7) {
    const result = await runInterruptionBackup({ isRetry: true });
    return NextResponse.json(result);
  }

  return NextResponse.json({
    ok: true,
    skipped: true,
    reason: `heure Toronto=${hour} (attend 6 ou 7)`,
  });
}
