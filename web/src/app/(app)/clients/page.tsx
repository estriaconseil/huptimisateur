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
      `id, name, phone, email, city, address_formatted, postal_code, lat, lng, created_at,
       jobs ( id, status, estimated_duration_hours, preferred_date, installation_info, internal_notes )`
    )
    .order("created_at", { ascending: false });

  const clients: ClientRow[] = (raw ?? []).map((r: unknown) => {
    const row = r as {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      city: string | null;
      address_formatted: string | null;
      postal_code: string | null;
      lat: number | null;
      lng: number | null;
      created_at: string;
      jobs: ClientRow["jobs"];
    };
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      city: row.city,
      address_formatted: row.address_formatted,
      postal_code: row.postal_code,
      lat: row.lat,
      lng: row.lng,
      created_at: row.created_at,
      jobs: Array.isArray(row.jobs) ? row.jobs : row.jobs ? [row.jobs] : [],
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients &amp; Jobs</h1>
          <p className="text-muted-foreground text-sm">
            {clients.length} client{clients.length > 1 ? "s" : ""} enregistré{clients.length > 1 ? "s" : ""}
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
