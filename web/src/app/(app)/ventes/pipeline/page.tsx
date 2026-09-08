import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PipelineClient } from "@/features/sales/pipeline-client";
import type { Salesperson } from "@/types/domain";
import { enrichPipelineRows } from "@/actions/pipeline";
import {
  PIPELINE_PAGE_SIZE,
  JOB_SELECT,
  type RawPipelineRow,
} from "@/lib/pipeline-config";

export default async function VentesPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; highlight?: string }>;
}) {
  const sp = await searchParams;
  const openJobId = sp.job ?? null;
  const highlightJobId = sp.highlight ?? null;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: nonEnAttenteRaw },
    { data: enAttenteRaw },
    { count: enAttenteTotal },
    { data: spData },
    { data: profile },
  ] = await Promise.all([
    // Tous les prospects + visites planifiées (volumes faibles — on charge tout)
    supabase
      .from("jobs")
      .select(JOB_SELECT)
      .in("status", ["soumission_en_attente", "soumission_repartie"])
      .order("follow_up_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),

    // Première tranche « Va nous rappeler »
    supabase
      .from("jobs")
      .select(JOB_SELECT)
      .eq("status", "en_attente")
      .order("follow_up_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .range(0, PIPELINE_PAGE_SIZE - 1),

    // Total « Va nous rappeler » (pour le compteur de plaquette et « Voir plus »)
    supabase
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "en_attente"),

    supabase
      .from("salespeople")
      .select(
        "id, name, active, profile_id, home_address, home_lat, home_lng, notes, created_at"
      )
      .eq("active", true)
      .order("name"),

    user
      ? supabase
          .from("salespeople")
          .select("id")
          .eq("profile_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const allRaw = [
    ...((nonEnAttenteRaw ?? []) as unknown as RawPipelineRow[]),
    ...((enAttenteRaw ?? []) as unknown as RawPipelineRow[]),
  ];

  const jobs = await enrichPipelineRows(allRaw);
  const salespeople = (spData ?? []) as Salesperson[];
  const currentSalespersonId = (profile as { id: string } | null)?.id ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <PipelineClient
        jobs={jobs}
        salespeople={salespeople}
        currentSalespersonId={currentSalespersonId}
        openJobId={openJobId}
        highlightJobId={highlightJobId}
        enAttenteTotal={enAttenteTotal ?? 0}
      />
    </div>
  );
}
