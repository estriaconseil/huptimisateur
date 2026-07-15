import { DispatchBoard } from "@/features/dispatch/dispatch-board";
import { loadDispatchPageData } from "@/features/dispatch/load-dispatch-data";

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; jobId?: string; suggest?: string }>;
}) {
  const sp = await searchParams;
  const data = await loadDispatchPageData(sp.week);

  const errLine = [data.errors.teams, data.errors.schedules, data.errors.jobs]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendrier / dispatch</h1>
      </div>

      {errLine ? (
        <p className="text-destructive text-sm" role="alert">
          {errLine}
        </p>
      ) : null}

      <DispatchBoard
        weekDates={data.weekDates}
        weekStartLabel={data.weekStartLabel}
        teams={data.teams}
        schedules={data.schedules}
        jobsForPicker={data.jobsForPicker}
        retourAFaireJobs={data.retourAFaireJobs}
        settings={data.settings}
        initialSuggestJobId={typeof sp.jobId === "string" ? sp.jobId : null}
        initialSuggestFlag={sp.suggest === "1"}
      />
    </div>
  );
}
