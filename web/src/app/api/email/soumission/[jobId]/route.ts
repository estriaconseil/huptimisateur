import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import React, { type ReactElement } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { QuoteDocument } from "@/features/pdf/QuoteDocument";
import type { Quote, QuoteUnit } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getLogoBase64(): string | null {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", "logo.jpg"));
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 });
  }

  // Body : { to: string }
  let to: string;
  try {
    const body = await req.json() as { to?: string };
    to = (body.to ?? "").trim();
    if (!to) throw new Error("Adresse courriel manquante");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
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
    return NextResponse.json({ ok: false, error: "Soumission introuvable" }, { status: 404 });
  }
  const quote = q as Quote;

  if (!(quote.subtotal > 0)) {
    return NextResponse.json(
      { ok: false, error: "Impossible d'envoyer une soumission sans sous-total." },
      { status: 400 }
    );
  }

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

  // Génération PDF
  const logoBase64 = getLogoBase64();
  const element = React.createElement(
    QuoteDocument, { quote, units, salespersonName, logoBase64, installAddress }
  ) as ReactElement<DocumentProps>;
  const pdfBuffer = await renderToBuffer(element);

  // Envoi Resend
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Huppé Réfrigération <onboarding@resend.dev>";

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY manquant" }, { status: 500 });
  }

  const resend = new Resend(apiKey);

  const { error: sendError } = await resend.emails.send({
    from,
    to: [to],
    subject: `Soumission #${quote.quote_number} — Huppé Réfrigération`,
    html: buildEmailHtml(quote, salespersonName),
    attachments: [
      {
        filename: `soumission-${quote.quote_number}.pdf`,
        content: pdfBuffer,
      },
    ],
  });

  if (sendError) {
    console.error("[Resend]", sendError);
    return NextResponse.json({ ok: false, error: sendError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function buildEmailHtml(quote: Quote, salespersonName: string | null): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- En-tête -->
        <tr>
          <td style="background:#1a1a2e;padding:24px 32px;">
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:1px;">Huppé Réfrigération</p>
            <p style="margin:4px 0 0;color:#aaaacc;font-size:12px;">2710, King Est, Sherbrooke, QC J1G 5H1 · 819 566-8061</p>
          </td>
        </tr>

        <!-- Corps -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;font-size:16px;font-weight:bold;">Soumission #${quote.quote_number}</p>

            <p style="margin:0 0 6px;">Bonjour${quote.client_name ? ` <strong>${quote.client_name}</strong>` : ""},</p>
            <p style="margin:0 0 16px;color:#555;">Veuillez trouver ci-joint votre soumission en format PDF. N'hésitez pas à nous contacter pour toute question.</p>

            ${salespersonName ? `<p style="margin:0 0 4px;color:#555;font-size:13px;">Représentant : <strong>${salespersonName}</strong></p>` : ""}
            <p style="margin:0;color:#555;font-size:13px;">Date : ${quote.quote_date}</p>
          </td>
        </tr>

        <!-- Pied de page -->
        <tr>
          <td style="background:#f7f7f7;padding:16px 32px;border-top:1px solid #e0e0e0;">
            <p style="margin:0;font-size:11px;color:#999;text-align:center;">
              Huppé Réfrigération · huppe@hupperefrigeration.com · 819 566-8061
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
