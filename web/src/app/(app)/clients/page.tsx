import { PlusCircle } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ClientsList, type ClientRow } from "@/features/clients/clients-list";

export default async function ClientsPage() {
  const supabase = await createServerSupabaseClient();

  const { data: raw, error } = await supabase
    .from("clients")
    .select(
      `id, name, phone, email, billing_address, billing_city, billing_postal, created_at,
       installation_addresses ( id, label, address_formatted, city, postal_code, lat, lng, installation_info ),
       jobs (
         id, status, estimated_duration_hours, preferred_date, installation_info, internal_notes, installation_address_id,
         quotes ( id, quote_number )
       )`
    )
    .order("created_at", { ascending: false });

  const clients: ClientRow[] = (raw ?? []).map((r: unknown) => {
    const row = r as {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      billing_address: string | null;
      billing_city: string | null;
      billing_postal: string | null;
      created_at: string;
      installation_addresses: ClientRow["installation_addresses"] | ClientRow["installation_addresses"][number] | null;
      jobs:
        | Array<ClientRow["jobs"][number] & { quotes?: { id: string; quote_number: number } | { id: string; quote_number: number }[] | null }>
        | (ClientRow["jobs"][number] & { quotes?: { id: string; quote_number: number } | { id: string; quote_number: number }[] | null })
        | null;
    };
    const addrs = Array.isArray(row.installation_addresses)
      ? row.installation_addresses
      : row.installation_addresses
        ? [row.installation_addresses]
        : [];
    const rawJobs = Array.isArray(row.jobs) ? row.jobs : row.jobs ? [row.jobs] : [];
    const jobs = rawJobs.map((j) => {
      const qRaw = j.quotes;
      const qList = Array.isArray(qRaw) ? qRaw : qRaw ? [qRaw] : [];
      const q = [...qList].sort((a, b) => (b.quote_number ?? 0) - (a.quote_number ?? 0))[0];
      return {
        id: j.id,
        status: j.status,
        estimated_duration_hours: j.estimated_duration_hours,
        preferred_date: j.preferred_date,
        installation_info: j.installation_info,
        internal_notes: j.internal_notes,
        installation_address_id: j.installation_address_id,
        quote_id: q?.id ?? null,
        quote_number: q?.quote_number ?? null,
      };
    });
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      billing_address: row.billing_address,
      billing_city: row.billing_city,
      billing_postal: row.billing_postal,
      created_at: row.created_at,
      installation_addresses: addrs,
      jobs,
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients &amp; Jobs</h1>
          <p className="text-muted-foreground text-sm">
            Comptes regroupés par adresse de facturation
          </p>
        </div>
        <Link href="/nouveau" className={buttonVariants({ size: "sm" })}>
          <PlusCircle className="size-3.5" />
          Nouveau client / job
        </Link>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">{error.message}</p>
      )}

      <ClientsList clients={clients} />
    </div>
  );
}
