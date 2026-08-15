import { NextResponse } from "next/server";

import { downloadLatestBackupPdf } from "@/features/interruption/run-backup";
import { getCurrentProfile } from "@/lib/supabase/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "secretary")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const result = await downloadLatestBackupPdf();
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
