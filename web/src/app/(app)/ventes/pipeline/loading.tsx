function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className ?? ""}`} />;
}

export default function PipelineLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Bone className="h-8 w-48" />
          <Bone className="h-4 w-56" />
        </div>
        <Bone className="h-[38px] w-40 rounded-lg" />
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Bone className="h-[88px] rounded-xl border border-emerald-200 bg-emerald-50/60" />
        <Bone className="h-[88px] rounded-xl border border-blue-200 bg-blue-50/60" />
        <Bone className="h-[88px] rounded-xl border border-violet-200 bg-violet-50/60" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Bone className="h-9 flex-1 rounded-lg" />
        <Bone className="h-9 w-40 rounded-lg" />
        <Bone className="h-9 w-40 rounded-lg" />
      </div>

      <ul className="space-y-2">
        {["border-l-emerald-400", "border-l-blue-400", "border-l-blue-400", "border-l-violet-400", "border-l-emerald-400"].map(
          (bar, i) => (
            <li
              key={i}
              className={`rounded-xl border border-l-4 bg-white p-4 ${bar}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Bone className="h-4 w-40" />
                  <Bone className="h-3 w-64 max-w-full" />
                </div>
                <Bone className="h-5 w-28 rounded-full" />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <Bone className="h-8 w-28 rounded-lg" />
                <Bone className="h-8 w-36 rounded-lg" />
              </div>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
