import { NextRequest, NextResponse } from "next/server";

import {
  torontoWeekdayIso,
} from "@/features/interruption/date-utils";
import { runInterruptionBackup } from "@/features/interruption/run-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron Vercel — Lun–Ven 10:00 UTC (~6h Québec en été, ~5h en hiver).
 * Un seul passage par jour (limite plan Hobby : pas 6h + retry 7h).
 * Protégé par Authorization: Bearer CRON_SECRET.
 *
 * Si Vercel est down, le dernier PDF reste dans Storage + courriel de la veille.
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

  // Un appel / jour : runInterruptionBackup ignore si déjà envoyé aujourd'hui.
  const result = await runInterruptionBackup({ isRetry: false });
  return NextResponse.json(result);
}
