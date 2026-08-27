import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  SOUMISSIONS_PAGE_SIZE,
  SoumissionsClient,
  type SoumissionRow,
} from "@/features/sales/soumissions-client";

function escapeIlike(value: string): string {
  return value.replace(/[%_,]/g, "\\$&");
}

export default async function SoumissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const pageRaw = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = SOUMISSIONS_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("quotes")
    .select(
      `
      id, quote_number, client_name, client_email, quote_date, status,
      subtotal, job_id, appointment_id,
      salespeople!salesperson_id(name),
      sales_appointments!appointment_id(scheduled_date)
    `,
      { count: "exact" }
    )
    .order("quote_number", { ascending: false })
    .range(from, to);

  if (q) {
    const safe = escapeIlike(q);
    const digits = q.replace(/\D/g, "");
    if (digits.length > 0 && /^\d+$/.test(q)) {
      query = query.or(
        `quote_number.eq.${digits},client_email.ilike.%${safe}%,client_name.ilike.%${safe}%`
      );
    } else {
      query = query.or(
        `client_email.ilike.%${safe}%,client_name.ilike.%${safe}%`
      );
    }
  }

  const { data: quotes, error, count } = await query;

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        Erreur chargement soumissions : {error.message}
      </div>
    );
  }

  return renderPage(quotes, count ?? 0, page, pageSize, q);
}

function renderPage(
  quotes: unknown[] | null,
  totalCount: number,
  page: number,
  pageSize: number,
  q: string
) {
  const rows: SoumissionRow[] = (quotes ?? []).map((raw) => {
    const qRow = raw as Record<string, unknown>;
    const sp = Array.isArray(qRow.salespeople) ? qRow.salespeople[0] : qRow.salespeople;
    const appt = Array.isArray(qRow.sales_appointments)
      ? qRow.sales_appointments[0]
      : qRow.sales_appointments;
    return {
      id: qRow.id as string,
      quote_number: qRow.quote_number as number,
      client_name: qRow.client_name as string,
      client_email: (qRow.client_email as string | null) ?? null,
      quote_date: qRow.quote_date as string,
      status: qRow.status as string,
      subtotal: Number(qRow.subtotal) || 0,
      job_id: (qRow.job_id as string | null) ?? null,
      appointment_id: (qRow.appointment_id as string | null) ?? null,
      salesperson_name: (sp as { name?: string } | null)?.name ?? null,
      scheduled_date:
        (appt as { scheduled_date?: string } | null)?.scheduled_date ?? null,
    };
  });

  return (
    <SoumissionsClient
      quotes={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      initialQuery={q}
    />
  );
}
