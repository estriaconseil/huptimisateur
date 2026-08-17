import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import React, { type ReactElement } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { QuoteDocument } from "@/features/pdf/QuoteDocument";
import type { Quote, QuoteUnit } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lit le logo depuis /public et retourne un data-URI base64. */
function getLogoBase64(): string | null {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.jpg");
    const buf = fs.readFileSync(logoPath);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("mode") === "install" ? "install" : "customer";
  const supabase = await createServerSupabaseClient();

  // Vérification session
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Soumission
  const { data: q, error: qErr } = await supabase
    .from("quotes")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qErr || !q) {
    return NextResponse.json({ error: "Soumission introuvable" }, { status: 404 });
  }
  const quote = q as Quote;

  // Unités
  const { data: rawUnits } = await supabase
    .from("quote_units")
    .select("*")
    .eq("quote_id", quote.id)
    .order("unit_order");
  const units = (rawUnits ?? []) as QuoteUnit[];

  // Vendeur
  let salespersonName: string | null = null;
  if (quote.salesperson_id) {
    const { data: sp } = await supabase
      .from("salespeople")
      .select("name")
      .eq("id", quote.salesperson_id)
      .maybeSingle();
    salespersonName = (sp as { name?: string } | null)?.name ?? null;
  }

  // Adresse d'installation via le job
  let installAddress: string | null = null;
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("installation_addresses!installation_address_id(address_formatted)")
    .eq("id", jobId)
    .maybeSingle();
  if (jobRow) {
    const raw = (jobRow as { installation_addresses: unknown }).installation_addresses;
    const addr = (Array.isArray(raw) ? raw[0] : raw) as { address_formatted?: string | null } | null;
    installAddress = addr?.address_formatted ?? null;
  }

  const logoBase64 = getLogoBase64();

  const element = React.createElement(
    QuoteDocument, { quote, units, salespersonName, logoBase64, installAddress, mode }
  ) as ReactElement<DocumentProps>;

  const buffer = await renderToBuffer(element);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${mode === "install" ? "installation" : "soumission"}-${quote.quote_number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
