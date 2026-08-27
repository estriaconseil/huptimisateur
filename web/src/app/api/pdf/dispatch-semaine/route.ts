import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { NextRequest, NextResponse } from "next/server";
import React, { type ReactElement } from "react";

import { buildInstallWeekExcelExport } from "@/features/dispatch/build-excel-export-lines";
import { loadDispatchPageData } from "@/features/dispatch/load-dispatch-data";
import { InstallWeekExportDocument } from "@/features/pdf/InstallWeekExportDocument";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const week = req.nextUrl.searchParams.get("week") ?? undefined;
  const data = await loadDispatchPageData(week);
  const weekLabel = `${format(parseISO(data.weekDates[0]!), "d MMM", { locale: fr })} – ${format(
    parseISO(data.weekDates[data.weekDates.length - 1]!),
    "d MMM yyyy",
    { locale: fr }
  )}`;

  const days = buildInstallWeekExcelExport(data.weekDates, data.schedules);

  const element = React.createElement(InstallWeekExportDocument, {
    weekLabel,
    days,
  }) as ReactElement<DocumentProps>;

  const pdfBuffer = await renderToBuffer(element);
  const filename = `installations-${data.weekDates[0]}_${data.weekDates[data.weekDates.length - 1]}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
