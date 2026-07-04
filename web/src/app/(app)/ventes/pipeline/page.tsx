import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";
import { PipelineClient, type PipelineJob } from "@/features/sales/pipeline-client";
import type { JobStatus, Salesperson } from "@/types/domain";

const PIPELINE_STATUSES: JobStatus[] = [
  "prospect",
  "soumission_en_attente",
  "a_suivre",
  "a_relancer",
];

export default async function VentesPipelinePage() {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: rawJobs }, { data: spData }, { data: profile }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        `id, status, salesperson_id, installation_info, internal_notes, follow_up_date, created_at,
         clients ( id, name, phone, email, city, address_formatted, lat, lng ),
         salespeople ( name )`
      )
      .in("status", PIPELINE_STATUSES)
      .order("follow_up_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),

    supabase
      .from("salespeople")
      .select("id, name, active, profile_id, home_address, home_lat, home_lng, notes, created_at")
      .eq("active", true)
      .order("name"),

    // Chercher si l'utilisateur connecté est un vendeur (Phase 2)
    user
      ? supabase
          .from("salespeople")
          .select("id")
          .eq("profile_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  type RawRow = {
    id: string;
    status: string;
    salesperson_id: string | null;
    installation_info: string | null;
    internal_notes: string | null;
    follow_up_date: string | null;
    created_at: string;
    clients: unknown;
    salespeople: unknown;
  };

  const jobs: PipelineJob[] = (rawJobs ?? []).map((r: unknown) => {
    const row = r as RawRow;
    return {
      id: row.id,
      status: row.status as JobStatus,
      salesperson_id: row.salesperson_id,
      installation_info: row.installation_info,
      internal_notes: row.internal_notes,
      follow_up_date: row.follow_up_date,
      created_at: row.created_at,
      clients: unwrapRelation<NonNullable<PipelineJob["clients"]>>(row.clients),
      salespeople: unwrapRelation<{ name: string }>(row.salespeople),
    };
  });

  const salespeople = (spData ?? []) as Salesperson[];

  // Phase 2 : si l'utilisateur est lié à un vendeur, pré-filtrer ses dossiers
  const currentSalespersonId = (profile as { id: string } | null)?.id ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <PipelineClient
        jobs={jobs}
        salespeople={salespeople}
        currentSalespersonId={currentSalespersonId}
      />
    </div>
  );
}
