import { format, parseISO, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, FileText, MapPin, Phone, PlusCircle } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { unwrapRelation } from "@/lib/supabase/unwrap-relation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { statusLabel, statusVariant } from "@/lib/job-status";
import { cn } from "@/lib/utils";
import type { EstimatedDurationHours, Job } from "@/types/domain";

type PendingJob = {
  id: string;
  estimated_duration_hours: EstimatedDurationHours;
  status: Job["status"];
  installation_info: string | null;
  internal_notes: string | null;
  preferred_date: string | null;
  created_at: string;
  clients: {
    name: string;
    phone: string | null;
    email: string | null;
    address_formatted: string | null;
  } | null;
};

function weekMondayIso(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export default async function APlanifierPage() {
  const supabase = await createServerSupabaseClient();

  /* jobs "a_planifier" = soumission acceptée, attendent un créneau.
     assignJobToSlot → reparti | removeSchedule → a_planifier */
  const { data: rawJobs, error } = await supabase
    .from("jobs")
    .select(
      `id, estimated_duration_hours, status, installation_info, internal_notes,
       preferred_date, created_at,
       clients ( name, phone, email, address_formatted )`
    )
    .eq("status", "a_planifier")
    .order("preferred_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const jobs: PendingJob[] = (rawJobs ?? [])
    .map((r: unknown) => {
      const row = r as {
        id: string;
        estimated_duration_hours: number;
        status: string;
        installation_info: string | null;
        internal_notes: string | null;
        preferred_date: string | null;
        created_at: string;
        clients: unknown;
      };
      return {
        id: row.id,
        estimated_duration_hours: row.estimated_duration_hours as EstimatedDurationHours,
        status: row.status as Job["status"],
        installation_info: row.installation_info,
        internal_notes: row.internal_notes,
        preferred_date: row.preferred_date,
        created_at: row.created_at,
        clients: unwrapRelation<{
          name: string;
          phone: string | null;
          email: string | null;
          address_formatted: string | null;
        }>(row.clients),
      };
    });

  const week = weekMondayIso();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs à placer</h1>
          <p className="text-muted-foreground text-sm">
            {jobs.length === 0
              ? "Toutes les jobs ont un créneau assigné."
              : `${jobs.length} job${jobs.length > 1 ? "s" : ""} sans créneau au calendrier.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dispatch" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <CalendarDays className="size-3.5" />
            Calendrier
          </Link>
          <Link href="/nouveau" className={buttonVariants({ size: "sm" })}>
            <PlusCircle className="size-3.5" />
            Nouvelle job
          </Link>
        </div>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error.message}
        </p>
      )}

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm">Aucune job en attente.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => {
            const clientName = job.clients?.name ?? "Client sans nom";
            const pref = job.preferred_date
              ? format(parseISO(job.preferred_date), "d MMMM yyyy", { locale: fr })
              : null;
            const durationLabel =
              job.estimated_duration_hours === 8 ? "Journée (8 h)" : "Demi-journée (4 h)";

            return (
              <li key={job.id}>
                <Card className="transition-shadow hover:shadow-sm">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    {/* Infos */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{clientName}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {durationLabel}
                        </Badge>
                        <Badge
                          variant={statusVariant(job.status)}
                          className="text-[10px]"
                        >
                          {statusLabel(job.status)}
                        </Badge>
                      </div>

                      {pref && (
                        <p className="text-muted-foreground text-xs">
                          Date souhaitée&nbsp;: {pref}
                        </p>
                      )}

                      {job.clients?.phone && (
                        <p className="text-muted-foreground text-xs flex items-center gap-1">
                          <Phone className="size-3" />
                          {job.clients.phone}
                        </p>
                      )}

                      {job.clients?.address_formatted && (
                        <p className="text-muted-foreground text-xs flex items-start gap-1">
                          <MapPin className="size-3 mt-0.5 shrink-0" />
                          <span>{job.clients.address_formatted}</span>
                        </p>
                      )}

                      {job.installation_info && (
                        <p className="text-muted-foreground line-clamp-2 text-xs">
                          {job.installation_info}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                      <Link
                        href={`/ventes/soumission/${job.id}`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                      >
                        <FileText className="size-3.5" />
                        Ouvrir soumission
                      </Link>
                      <Link
                        href={`/dispatch?week=${week}&jobId=${job.id}&suggest=1`}
                        className={buttonVariants({ size: "sm" })}
                      >
                        <MapPin className="size-3.5" />
                        Suggestions distance
                      </Link>
                      <Link
                        href={`/dispatch?week=${week}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Placer manuellement
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
