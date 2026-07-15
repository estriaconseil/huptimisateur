"use client";

import React from "react";
import {
  addWeeks,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRightLeft, CalendarDays, ChevronLeft, ChevronRight, Loader2, MapPin, Printer, PlusCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { assignJobToSlot, removeSchedule } from "@/actions/schedules";
import { getDistanceSuggestionsForJob } from "@/actions/suggestions";
import { getJobDetails, type JobFullDetail } from "@/actions/jobs";
import { rankJobsFromOrigin, type RankedPickerJob } from "@/actions/picker";
import { MAX_SUGGESTIONS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NewClientJobForm } from "@/features/jobs/new-client-job-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { JobPickerRow, RetourAFaireRow, TeamWithTechs } from "@/features/dispatch/load-dispatch-data";
import { updateJobStatus } from "@/actions/jobs";
import { statusLabel } from "@/lib/job-status";
import { slotLabel } from "@/services/planning/slot-rules";
import {
  buildDispatchStateMap,
  getDayState,
  type EnrichedScheduleRow,
} from "@/services/planning/dispatch-state";
import type { AppSettings, EstimatedDurationHours, ScheduleSuggestion } from "@/types/domain";
import { cn } from "@/lib/utils";

type PickTarget = {
  teamId: string;
  scheduledDate: string;
  half: "am" | "pm";
};

type DetailTarget =
  | { kind: "am"; scheduleId: string; jobId: string; label: string }
  | { kind: "pm"; scheduleId: string; jobId: string; label: string };

type Props = {
  weekDates: string[];
  weekStartLabel: string;
  teams: TeamWithTechs[];
  schedules: EnrichedScheduleRow[];
  jobsForPicker: JobPickerRow[];
  retourAFaireJobs: RetourAFaireRow[];
  settings: AppSettings | null;
  initialSuggestJobId: string | null;
  initialSuggestFlag: boolean;
};

function formatKm(m: number | null): string {
  if (m == null) return "—";
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function formatDur(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.round(sec / 60);
  return `${m} min`;
}

export function DispatchBoard(props: Props) {
  const {
    weekDates,
    weekStartLabel,
    teams,
    schedules,
    jobsForPicker,
    retourAFaireJobs,
    settings,
    initialSuggestJobId,
    initialSuggestFlag,
  } = props;

  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const threshold = settings?.full_day_threshold_hours ?? 8;
  const stateMap = useMemo(() => buildDispatchStateMap(schedules), [schedules]);

  const [pickOpen, setPickOpen] = useState(false);
  const [pickTarget, setPickTarget] = useState<PickTarget | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pickerRanked, setPickerRanked] = useState<RankedPickerJob[] | null>(null);
  const [pickerRankLoading, setPickerRankLoading] = useState(false);
  const [pickerOriginLabel, setPickerOriginLabel] = useState<string | null>(null);

  /**
   * Jobs filtrés selon la compatibilité avec le slot cible.
   * Si le slot adjacent (AM ou PM) est déjà occupé, seules les jobs de 4 h peuvent s'y placer.
   * Une job de 8 h exige les deux moitiés libres (journée complète).
   */
  const compatibleJobsForPicker = useMemo(() => {
    if (!pickTarget) return jobsForPicker;
    const state = getDayState(stateMap, pickTarget.teamId, pickTarget.scheduledDate);
    const adjacentSlot = pickTarget.half === "pm" ? state.am : state.pm;
    if (adjacentSlot.kind === "busy") {
      return jobsForPicker.filter((j) => j.estimated_duration_hours <= 4);
    }
    return jobsForPicker;
  }, [pickTarget, stateMap, jobsForPicker]);

  const [newJobOpen, setNewJobOpen] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [detailJobFull, setDetailJobFull] = useState<JobFullDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestJobId, setSuggestJobId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  /** Si un déplacement est en cours, contient le scheduleId à retirer seulement lors du choix final */
  const [moveSourceScheduleId, setMoveSourceScheduleId] = useState<string | null>(null);
  const [suggestWarning, setSuggestWarning] = useState<string | null>(null);
  const [suggestTargetDate, setSuggestTargetDate] = useState("");
  const [suggestExcludeDate, setSuggestExcludeDate] = useState<string | null>(null);

  const suggestJobMeta = useMemo(() => {
    if (!suggestJobId) return null;
    const fromPicker = jobsForPicker.find((j) => j.id === suggestJobId);
    const fromSchedule = schedules.find((s) => s.job_id === suggestJobId);
    const hrs =
      fromPicker?.estimated_duration_hours ??
      fromSchedule?.job?.estimated_duration_hours ??
      4;
    return { estimated_duration_hours: hrs as EstimatedDurationHours };
  }, [suggestJobId, jobsForPicker, schedules]);

  const dateInputRef = useRef<HTMLInputElement>(null);

  // ── Refresh automatique (2 min) — désactivé quand un dialogue est ouvert ──
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const autoRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const anyDialogOpen = pickOpen || newJobOpen || detailOpen || sheetOpen;

  useEffect(() => {
    if (anyDialogOpen) {
      if (autoRefreshInterval.current) clearInterval(autoRefreshInterval.current);
      return;
    }
    autoRefreshInterval.current = setInterval(() => {
      setAutoRefreshing(true);
      router.refresh();
      setLastRefresh(new Date());
      setTimeout(() => setAutoRefreshing(false), 800);
    }, 2 * 60 * 1000);
    return () => { if (autoRefreshInterval.current) clearInterval(autoRefreshInterval.current); };
  }, [anyDialogOpen, router]);

  const navigateToMonday = useCallback(
    (mondayDate: Date) => {
      const iso = format(startOfWeek(mondayDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
      router.push(`/dispatch?week=${encodeURIComponent(iso)}`);
    },
    [router]
  );

  const shiftWeek = useCallback(
    (delta: number) => {
      const monday = parseISO(weekStartLabel);
      navigateToMonday(addWeeks(monday, delta));
    },
    [weekStartLabel, navigateToMonday]
  );

  useEffect(() => {
    if (!initialSuggestFlag || !initialSuggestJobId) return;
    setSuggestJobId(initialSuggestJobId);
    setSheetOpen(true);
    setSuggestLoading(true);
    setSuggestions([]);
    setSuggestWarning(null);
    let cancelled = false;
    void getDistanceSuggestionsForJob(initialSuggestJobId, weekStartLabel).then((res) => {
      if (cancelled) return;
      setSuggestLoading(false);
      if (res.ok) {
        setSuggestions(res.suggestions);
        setSuggestWarning(res.warning ?? null);
      } else {
        setSuggestWarning(res.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialSuggestFlag, initialSuggestJobId, weekStartLabel]);

  function openPick(teamId: string, dateStr: string, half: "am" | "pm") {
    const team = teams.find((t) => t.id === teamId);
    if (!team?.active) return;
    const state = getDayState(stateMap, teamId, dateStr);
    if (state.fullDay) return;
    if (half === "am" && state.am.kind === "busy") return;
    if (half === "pm" && state.pm.kind === "busy") return;

    setPickError(null);
    setPickerRanked(null);
    setPickerRankLoading(false);
    setPickerOriginLabel(null);
    setPickTarget({ teamId, scheduledDate: dateStr, half });
    setPickOpen(true);

    /* Détecter si le slot adjacent est occupé pour trier par proximité */
    const adjacentSlot = half === "pm" ? state.am : state.pm;
    if (adjacentSlot.kind === "busy") {
      const adjSched = schedules.find((s) => s.id === adjacentSlot.scheduleId);
      const origin = adjSched?.job?.clients;
      if (origin?.lat != null && origin?.lng != null) {
        const lat = origin.lat;
        const lng = origin.lng;
        const originLabel = `${adjSched?.job?.clients?.name ?? "job"} (${half === "pm" ? "AM" : "PM"})`;
        setPickerOriginLabel(originLabel);
        setPickerRankLoading(true);
        void rankJobsFromOrigin(
          { lat, lng },
          jobsForPicker.map((j) => ({
            id: j.id,
            lat: j.clients?.lat ?? null,
            lng: j.clients?.lng ?? null,
          }))
        ).then((res) => {
          setPickerRankLoading(false);
          if (res.ok) setPickerRanked(res.ranked);
        });
      }
    }
  }

  function openDetail(_teamId: string, _dateStr: string, detailTarget: DetailTarget) {
    setDetail(detailTarget);
    setDetailJobFull(null);
    setDetailOpen(true);
    setDetailLoading(true);
    void getJobDetails(detailTarget.jobId).then((res) => {
      setDetailLoading(false);
      if (res.ok) setDetailJobFull(res.data);
    });
  }

  async function confirmAssign(job: JobPickerRow) {
    if (!pickTarget) return;
    setPickError(null);
    startTransition(async () => {
      const res = await assignJobToSlot({
        jobId: job.id,
        teamId: pickTarget.teamId,
        scheduledDate: pickTarget.scheduledDate,
        half: pickTarget.half,
        fullDayThresholdHours: threshold,
        estimatedDurationHours: job.estimated_duration_hours,
      });
      if (!res.ok) {
        setPickError(res.message);
        return;
      }
      setPickOpen(false);
      setPickTarget(null);
      router.refresh();
    });
  }

  async function confirmRemoveSchedule() {
    if (!detail) return;
    startTransition(async () => {
      const res = await removeSchedule(detail.scheduleId);
      if (!res.ok) {
        setPickError(res.message);
        return;
      }
      setDetailOpen(false);
      setDetail(null);
      router.refresh();
    });
  }

  async function openSuggestionsForJob(
    jobId: string,
    opts: { excludeDate?: string | null; targetDate?: string } = {}
  ) {
    setSuggestJobId(jobId);
    setSuggestions([]);
    setSuggestWarning(null);
    setSuggestExcludeDate(opts.excludeDate ?? null);
    setSheetOpen(true);
    setSuggestLoading(true);
    const fetchDate = opts.targetDate ?? (opts.excludeDate ?? weekStartLabel);
    const res = await getDistanceSuggestionsForJob(jobId, weekStartLabel, fetchDate !== weekStartLabel ? fetchDate : undefined);
    setSuggestLoading(false);
    if (res.ok) {
      setSuggestions(res.suggestions);
      setSuggestWarning(res.warning ?? null);
    } else {
      setSuggestWarning(res.message);
    }
  }

  function moveAppointment() {
    if (!detail) return;
    const jobId = detail.jobId;
    const sourceScheduleId = detail.scheduleId;
    const sourceDate = schedules.find((s) => s.id === sourceScheduleId)?.scheduled_date ?? null;

    /* Mémoriser le créneau source — il sera retiré seulement quand l'utilisateur choisit un nouveau slot */
    setMoveSourceScheduleId(sourceScheduleId);
    setSuggestExcludeDate(sourceDate);
    setDetailOpen(false);
    setDetailJobFull(null);

    setSuggestJobId(jobId);
    setSuggestions([]);
    setSuggestWarning(null);
    setSheetOpen(true);
    setSuggestLoading(true);
    void getDistanceSuggestionsForJob(
      jobId,
      weekStartLabel,
      suggestTargetDate || sourceDate || undefined
    ).then((r) => {
      setSuggestLoading(false);
      if (r.ok) { setSuggestions(r.suggestions); setSuggestWarning(r.warning ?? null); }
      else setSuggestWarning(r.message);
    });
  }

  async function applySuggestion(s: ScheduleSuggestion) {
    if (!suggestJobId || !suggestJobMeta) return;
    const half: "am" | "pm" = s.slot === "pm" ? "pm" : "am";
    startTransition(async () => {
      /* Si déplacement en cours, retirer l'ancien créneau en premier */
      if (moveSourceScheduleId) {
        const removeRes = await removeSchedule(moveSourceScheduleId);
        if (!removeRes.ok) {
          setSuggestWarning(removeRes.message);
          return;
        }
        setMoveSourceScheduleId(null);
      }

      const res = await assignJobToSlot({
        jobId: suggestJobId,
        teamId: s.teamId,
        scheduledDate: s.date,
        half,
        fullDayThresholdHours: threshold,
        estimatedDurationHours: suggestJobMeta.estimated_duration_hours,
      });
      if (!res.ok) {
        setSuggestWarning(res.message);
        return;
      }
      setSheetOpen(false);
      setSuggestions([]);
      router.push(`/dispatch?week=${encodeURIComponent(weekStartLabel)}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Navigation semaine — ordre : ← info → 📅 Cette semaine */}
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="icon" onClick={() => shiftWeek(-1)}>
            <ChevronLeft className="size-4" />
          </Button>

          <span className="min-w-[160px] text-center text-sm font-medium tabular-nums">
            {format(parseISO(weekDates[0]!), "d MMM", { locale: fr })} –{" "}
            {format(parseISO(weekDates[weekDates.length - 1]!), "d MMM yyyy", { locale: fr })}
          </span>

          <Button type="button" variant="outline" size="icon" onClick={() => shiftWeek(1)}>
            <ChevronRight className="size-4" />
          </Button>

          {/* Séparateur visuel */}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />

          {/* Input date caché — déclenché par le bouton calendrier */}
          <input
            ref={dateInputRef}
            type="date"
            className="sr-only"
            value={weekDates[0] ?? ""}
            onChange={(e) => {
              if (!e.target.value) return;
              navigateToMonday(parseISO(e.target.value));
            }}
            aria-label="Aller à une date"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Aller à une date"
            onClick={() => {
              const el = dateInputRef.current;
              if (!el) return;
              typeof el.showPicker === "function" ? el.showPicker() : el.click();
            }}
          >
            <CalendarDays className="size-4" />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigateToMonday(new Date())}
          >
            Cette semaine
          </Button>
        </div>

        {/* Boutons droite */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Indicateur de refresh */}
          <button
            type="button"
            onClick={() => { setAutoRefreshing(true); router.refresh(); setLastRefresh(new Date()); setTimeout(() => setAutoRefreshing(false), 800); }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            title="Rafraîchir"
          >
            {autoRefreshing
              ? <Loader2 className="size-3.5 animate-spin" />
              : <ArrowRightLeft className="size-3.5" />
            }
            <span className="hidden sm:inline">{format(lastRefresh, "HH:mm")}</span>
          </button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => setNewJobOpen(true)}
          >
            <PlusCircle className="size-3.5" />
            Nouvelle job
          </Button>
        </div>
      </div>

      <Legend />

      <ScrollArea className="w-full">
        <div className="min-w-[920px]">
          <table className="border-border w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-36" />
              {weekDates.map((d) => (
                <col key={d} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 z-20 border border-border bg-secondary p-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Équipe
                </th>
                {weekDates.map((d) => (
                  <th key={d} className="border border-border bg-secondary p-2 text-center">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-foreground capitalize">
                      {format(parseISO(d), "EEE", { locale: fr })}
                    </span>
                    <span className="text-xs text-muted-foreground">{format(parseISO(d), "d MMM", { locale: fr })}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((team, teamIdx) => (
                <React.Fragment key={team.id}>
                  {/* Séparateur entre équipes */}
                  {teamIdx > 0 && (
                    <tr aria-hidden>
                      <td
                        colSpan={weekDates.length + 1}
                        className="h-[13px] border-0 bg-muted/10 p-0"
                      />
                    </tr>
                  )}
                  <tr
                    className={cn(
                      "border-b border-b-border/40 bg-white dark:bg-card",
                      !team.active && "opacity-55"
                    )}
                  >
                  <td className="sticky left-0 z-10 border border-border bg-white p-2 dark:bg-card">
                    <div className="flex items-center gap-2">
                      {team.color && (
                        <span
                          className="inline-block size-3 shrink-0 rounded-full border"
                          style={{ backgroundColor: team.color }}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium leading-tight">{team.name}</span>
                          {!team.active && (
                            <span className="text-muted-foreground text-[10px] uppercase">inactive</span>
                          )}
                        </div>
                        {team.technicians.length > 0 && (
                          <div className="mt-0.5 space-y-0">
                            {team.technicians.map((tech) => (
                              <p key={tech.id} className="truncate text-[11px] leading-tight text-muted-foreground">
                                {tech.first_name} {tech.last_name}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {weekDates.map((dateStr) => {
                    const state = getDayState(stateMap, team.id, dateStr);
                    const amBusy = state.am.kind === "busy" ? state.am : null;
                    const pmBusy = state.pm.kind === "busy" ? state.pm : null;
                    /* Journée complète : un seul schedule couvre AM+PM */
                    const fullDayBusy = state.fullDay ? amBusy : null;
                    return (
                      <td key={`${team.id}-${dateStr}`} className="border border-border bg-inherit p-0 align-top">
                        {state.fullDay && fullDayBusy ? (
                          /* ── Bloc journée complète ── */
                          <FullDayCell
                            labelText={fullDayBusy.label}
                            city={fullDayBusy.city}
                            phone={fullDayBusy.phone}
                            email={fullDayBusy.email}
                            onOpenDetail={() =>
                              openDetail(team.id, dateStr, {
                                kind: "am",
                                scheduleId: fullDayBusy.scheduleId,
                                jobId: fullDayBusy.jobId,
                                label: fullDayBusy.label,
                              })
                            }
                          />
                        ) : (
                          /* ── Deux demi-créneaux ── */
                          <div className="flex flex-col divide-y">
                            <HalfCell
                              label="AM"
                              teamActive={team.active}
                              occupied={!!amBusy}
                              fullDay={false}
                              labelText={amBusy?.label}
                              city={amBusy?.city}
                              phone={amBusy?.phone}
                              email={amBusy?.email}
                              onPick={() => openPick(team.id, dateStr, "am")}
                              onOpenDetail={
                                amBusy
                                  ? () =>
                                      openDetail(team.id, dateStr, {
                                        kind: "am",
                                        scheduleId: amBusy.scheduleId,
                                        jobId: amBusy.jobId,
                                        label: amBusy.label,
                                      })
                                  : undefined
                              }
                            />
                            <HalfCell
                              label="PM"
                              teamActive={team.active}
                              occupied={!!pmBusy}
                              fullDay={false}
                              labelText={pmBusy?.label}
                              city={pmBusy?.city}
                              phone={pmBusy?.phone}
                              email={pmBusy?.email}
                              onPick={() => openPick(team.id, dateStr, "pm")}
                              onOpenDetail={
                                pmBusy
                                  ? () =>
                                      openDetail(team.id, dateStr, {
                                        kind: "pm",
                                        scheduleId: pmBusy.scheduleId,
                                        jobId: pmBusy.jobId,
                                        label: pmBusy.label,
                                      })
                                  : undefined
                              }
                            />
                          </div>
                        )}
                      </td>
                    );
                  })}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* ── Section : jobs en attente de planification ──────────────── */}
      {(jobsForPicker.length > 0 || retourAFaireJobs.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* À planifier */}
          {jobsForPicker.length > 0 && (
            <div className="rounded-xl border p-4 space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-semibold">
                  {statusLabel("a_planifier")}
                </span>
                <span className="text-muted-foreground font-normal">{jobsForPicker.length} job{jobsForPicker.length > 1 ? "s" : ""}</span>
              </h2>
              <ul className="space-y-1">
                {jobsForPicker.map((job) => (
                  <li key={job.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/40 transition-colors">
                    <div className="min-w-0">
                      <span className="font-medium">{job.clients?.name ?? "Sans nom"}</span>
                      {job.clients?.city && <span className="block text-xs text-muted-foreground">📍 {job.clients.city}</span>}
                      {job.installation_info && <span className="block text-xs text-muted-foreground line-clamp-1">{job.installation_info}</span>}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 ml-2"
                      onClick={() => void openSuggestionsForJob(job.id, {})}
                    >
                      Planifier
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Retour à faire */}
          {retourAFaireJobs.length > 0 && (
            <div className="rounded-xl border p-4 space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 text-[11px] font-semibold">
                  {statusLabel("retour_a_faire")}
                </span>
                <span className="text-muted-foreground font-normal">{retourAFaireJobs.length} job{retourAFaireJobs.length > 1 ? "s" : ""}</span>
              </h2>
              <ul className="space-y-1">
                {retourAFaireJobs.map((job) => (
                  <li key={job.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/40 transition-colors">
                    <div className="min-w-0">
                      <span className="font-medium">{job.clients?.name ?? "Sans nom"}</span>
                      {job.clients?.city && <span className="block text-xs text-muted-foreground">📍 {job.clients.city}</span>}
                      {job.installation_info && <span className="block text-xs text-muted-foreground line-clamp-1">{job.installation_info}</span>}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 ml-2"
                      onClick={() => {
                        startTransition(async () => {
                          await updateJobStatus(job.id, "a_planifier");
                          router.refresh();
                        });
                      }}
                    >
                      Replanifier
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Dialog open={pickOpen} onOpenChange={(o) => { setPickOpen(o); if (!o) { setPickerRanked(null); setPickerOriginLabel(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Affecter une job</DialogTitle>
            <DialogDescription>
              Créneau {pickTarget?.half === "am" ? "AM" : "PM"} — choisis une job à placer.
              {(() => {
                if (!pickTarget) return null;
                const st = getDayState(stateMap, pickTarget.teamId, pickTarget.scheduledDate);
                const adj = pickTarget.half === "pm" ? st.am : st.pm;
                if (adj.kind === "busy") {
                  return <span className="ml-1 text-amber-600 font-medium">L'autre demi-journée est occupée — seules les jobs de 4 h sont affichées.</span>;
                }
                return null;
              })()}
            </DialogDescription>
          </DialogHeader>
          {pickError && <p className="text-destructive text-sm">{pickError}</p>}

          {/* Indicateur de classement par proximité */}
          {pickerOriginLabel && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {pickerRankLoading
                ? <span className="flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Classement par proximité depuis {pickerOriginLabel}…</span>
                : <span>📍 Triées par distance depuis {pickerOriginLabel}</span>
              }
            </div>
          )}

          <ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
            {(() => {
              /* Si classement disponible, réordonner compatibleJobsForPicker selon pickerRanked */
              let orderedJobs = compatibleJobsForPicker;
              if (pickerRanked && pickerRanked.length > 0) {
                const rankMap = new Map(pickerRanked.map((r) => [r.id, r]));
                const ranked = pickerRanked
                  .map((r) => {
                    const job = compatibleJobsForPicker.find((j) => j.id === r.id);
                    return job ? { job, rank: r } : null;
                  })
                  .filter((x): x is { job: typeof compatibleJobsForPicker[number]; rank: RankedPickerJob } => x !== null);
                const unranked = compatibleJobsForPicker
                  .filter((j) => !rankMap.has(j.id))
                  .map((job) => ({ job, rank: null as RankedPickerJob | null }));
                orderedJobs = [...ranked.map((x) => x.job), ...unranked.map((x) => x.job)];
                return orderedJobs.map((job) => {
                  const rank = ranked.find((r) => r.job.id === job.id)?.rank ?? null;
                  return (
                    <li key={job.id}>
                      <button
                        type="button"
                        disabled={pending}
                        className="hover:bg-accent w-full rounded-md border px-3 py-2 text-left text-sm transition-colors"
                        onClick={() => void confirmAssign(job)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium">{job.clients?.name ?? "Sans nom"}</span>
                            {job.clients?.city && (
                              <span className="text-muted-foreground block text-xs">📍 {job.clients.city}</span>
                            )}
                            <span className="text-muted-foreground block text-xs">{job.estimated_duration_hours} h</span>
                          </div>
                          {rank && (
                            <div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                              <span className="block font-medium">{formatKm(rank.distanceMeters)}</span>
                              <span className="block">~{formatDur(rank.durationSeconds)}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                });
              }

              /* Sans classement : liste simple */
              return orderedJobs.map((job) => (
                <li key={job.id}>
                  <button
                    type="button"
                    disabled={pending}
                    className="hover:bg-accent w-full rounded-md border px-3 py-2 text-left text-sm transition-colors"
                    onClick={() => void confirmAssign(job)}
                  >
                    <span className="font-medium">{job.clients?.name ?? "Sans nom"}</span>
                    {job.clients?.city && (
                      <span className="text-muted-foreground block text-xs">📍 {job.clients.city}</span>
                    )}
                    <span className="text-muted-foreground block text-xs">{job.estimated_duration_hours} h</span>
                  </button>
                </li>
              ));
            })()}
          </ul>

          {compatibleJobsForPicker.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {jobsForPicker.length > 0
                ? "Aucune job de 4 h disponible — l'autre demi-journée est déjà occupée."
                : <>Aucune job disponible. Crée-en une avec le bouton <strong>Nouvelle job</strong> en haut du calendrier.</>
              }
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPickOpen(false)}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) { setDetailJobFull(null); setDeleteConfirm(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detailLoading ? "Chargement…" : (detailJobFull?.clientName ?? detail?.label ?? "Créneau")}
            </DialogTitle>
            {detail && detailJobFull && (
              <DialogDescription className="flex items-center gap-2 mt-1">
                <span className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold text-white",
                  detail.kind === "am" ? "bg-[#0073ea]" : "bg-violet-500"
                )}>
                  {detail.kind.toUpperCase()}
                </span>
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                  {detailJobFull.estimatedDurationHours} h
                </span>
              </DialogDescription>
            )}
          </DialogHeader>

          {detailLoading && (
            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" /> Chargement…
            </div>
          )}

          {detailJobFull && !detailLoading && (
            <div className="space-y-3 py-1 text-sm">
              {/* Contact */}
              <div className="space-y-0.5">
                {detailJobFull.clientPhone && (
                  <p className="flex items-center gap-2">
                    <span className="w-20 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tél.</span>
                    <a href={`tel:${detailJobFull.clientPhone}`} className="text-primary hover:underline">
                      {detailJobFull.clientPhone}
                    </a>
                  </p>
                )}
                {detailJobFull.clientEmail && (
                  <p className="flex items-center gap-2">
                    <span className="w-20 text-xs font-medium text-muted-foreground uppercase tracking-wide">Courriel</span>
                    <a href={`mailto:${detailJobFull.clientEmail}`} className="text-primary hover:underline truncate">
                      {detailJobFull.clientEmail}
                    </a>
                  </p>
                )}
              </div>

              {/* Adresse */}
              {(detailJobFull.clientAddress || detailJobFull.clientCity) && (
                <div className="rounded-md bg-muted/40 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Adresse</p>
                  {detailJobFull.clientAddress && <p>{detailJobFull.clientAddress}</p>}
                  {detailJobFull.clientCity && (
                    <p>{detailJobFull.clientCity}{detailJobFull.clientPostal ? `, ${detailJobFull.clientPostal}` : ""}</p>
                  )}
                </div>
              )}

              {/* Installation */}
              {detailJobFull.installationInfo && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Installation</p>
                  <p className="whitespace-pre-wrap text-foreground">{detailJobFull.installationInfo}</p>
                </div>
              )}

              {/* Notes internes */}
              {detailJobFull.internalNotes && (
                <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 dark:bg-yellow-950/30">
                  <p className="text-xs font-medium text-yellow-700 uppercase tracking-wide mb-1">Notes internes</p>
                  <p className="whitespace-pre-wrap text-yellow-900 dark:text-yellow-200">{detailJobFull.internalNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* Confirmation suppression */}
          {deleteConfirm && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              <p className="font-medium text-destructive mb-2">Retirer ce créneau du calendrier ?</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" disabled={pending} onClick={() => void confirmRemoveSchedule()}>
                  Oui, retirer
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="flex-wrap items-center gap-2">
            {/* 1 — Imprimer */}
            <Tooltip>
              <TooltipTrigger render={<Button type="button" variant="outline" size="icon" onClick={() => window.print()} />}>
                <Printer className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Imprimer la fiche</TooltipContent>
            </Tooltip>

            {/* 2 — Suggestions */}
            {detail?.jobId && (
              <Tooltip>
                <TooltipTrigger render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const schedDate = schedules.find((s) => s.id === detail.scheduleId)?.scheduled_date ?? null;
                      setDetailOpen(false);
                      void openSuggestionsForJob(detail.jobId, { excludeDate: schedDate });
                    }}
                  />
                }>
                  <MapPin className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Suggestions par distance</TooltipContent>
              </Tooltip>
            )}

            {/* 3 — Déplacer */}
            <Tooltip>
              <TooltipTrigger render={
                <Button type="button" variant="outline" size="icon" disabled={pending} onClick={() => moveAppointment()} />
              }>
                <ArrowRightLeft className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Déplacer vers un autre créneau</TooltipContent>
            </Tooltip>

            {/* 4 — Supprimer (demande confirmation) */}
            <Tooltip>
              <TooltipTrigger render={
                <Button
                  type="button"
                  variant={deleteConfirm ? "destructive" : "outline"}
                  size="icon"
                  disabled={pending}
                  onClick={() => setDeleteConfirm(true)}
                />
              }>
                <Trash2 className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Retirer du calendrier</TooltipContent>
            </Tooltip>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) setMoveSourceScheduleId(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col gap-0 overflow-hidden p-0">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b">
            <DialogHeader>
              <DialogTitle>Suggestions par distance</DialogTitle>
            </DialogHeader>
            {/* Sélecteur de journée cible */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <label htmlFor="suggest-date" className="text-sm font-medium whitespace-nowrap">
                Journée cible
              </label>
              <input
                id="suggest-date"
                type="date"
                value={suggestTargetDate}
                onChange={(e) => setSuggestTargetDate(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <Button
                type="button"
                size="sm"
                disabled={!suggestTargetDate || !suggestJobId || suggestLoading}
                onClick={() => {
                  if (!suggestJobId) return;
                  setSuggestions([]);
                  setSuggestWarning(null);
                  setSuggestLoading(true);
                  void getDistanceSuggestionsForJob(suggestJobId, weekStartLabel, suggestTargetDate).then((r) => {
                    setSuggestLoading(false);
                    if (r.ok) { setSuggestions(r.suggestions); setSuggestWarning(r.warning ?? null); }
                    else setSuggestWarning(r.message);
                  });
                }}
              >
                {suggestLoading ? <Loader2 className="size-3.5 animate-spin" /> : "Chercher"}
              </Button>
            </div>
          </div>

          {/* Liste */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {suggestLoading && (
              <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" /> Calcul Google Maps en cours…
              </div>
            )}
            {suggestWarning && !suggestLoading && (
              <p className="text-muted-foreground py-4 text-sm">{suggestWarning}</p>
            )}
            {!suggestLoading && !suggestWarning && (() => {
              const filtered = suggestions
                .filter((s) => !suggestExcludeDate || s.date !== suggestExcludeDate)
                .filter((s) => !suggestTargetDate || s.date === suggestTargetDate);
              if (filtered.length > 0) return null;
              return (
                <p className="text-muted-foreground py-4 text-sm">
                  {suggestions.length === 0
                    ? "Aucun créneau libre pour cette période."
                    : `Aucun créneau libre le ${suggestTargetDate ? format(parseISO(suggestTargetDate), "EEEE d MMMM", { locale: fr }) : "jour sélectionné"}. Essaie une autre journée.`}
                </p>
              );
            })()}
            <ul className="space-y-2 pb-4">
              {suggestions
                .filter((s) => !suggestExcludeDate || s.date !== suggestExcludeDate)
                .filter((s) => !suggestTargetDate || s.date === suggestTargetDate)
                /* Déjà triés par distance depuis rankScheduleSuggestions */
                .slice(0, MAX_SUGGESTIONS)
                .map((s, idx) => (
                  <li key={`${s.teamId}-${s.date}-${s.slot}-${idx}`}>
                    <button
                      type="button"
                      disabled={pending}
                      className="border-border hover:bg-accent w-full rounded-lg border px-3 py-2.5 text-left transition-colors"
                      onClick={() => void applySuggestion(s)}
                    >
                      {/* Ligne principale : date à gauche, distance à droite */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold capitalize">
                          {format(parseISO(s.date), "EEEE d MMMM", { locale: fr })}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{slotLabel(s.slot)}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatKm(s.distanceMeters)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">~{formatDur(s.durationSeconds)}</span>
                        </span>
                      </div>
                      {/* Équipe en dessous, plus petit */}
                      <p className="mt-0.5 text-xs text-muted-foreground">{s.teamName}</p>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Nouvelle job ─────────────────────────────── */}
      <Dialog open={newJobOpen} onOpenChange={setNewJobOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle job</DialogTitle>
            <DialogDescription>
              Crée un nouveau client et une job. Tu pourras l&apos;affecter au calendrier ensuite.
            </DialogDescription>
          </DialogHeader>
          <NewClientJobForm
            onSuccess={(jobId) => {
              setNewJobOpen(false);
              router.refresh();
              /* Ouvrir les suggestions pour cette nouvelle job */
              void openSuggestionsForJob(jobId, {});
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FullDayCell(props: {
  labelText?: string;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  onOpenDetail?: () => void;
}) {
  const { labelText, city, phone, email, onOpenDetail } = props;
  const hasContact = phone || email;

  const cellBtn = (
    <button
      type="button"
      className="flex min-h-[104px] w-full flex-col items-start bg-[#00854d] px-2 py-1.5 text-left text-white transition-colors cursor-pointer hover:brightness-90"
      onClick={onOpenDetail}
    >
      <span className="text-[10px] font-semibold uppercase opacity-80">Journée complète</span>
      <span className="mt-0.5 line-clamp-2 text-sm font-semibold leading-tight">{labelText ?? "—"}</span>
      {city && <span className="mt-0.5 text-xs opacity-90 leading-tight">{city}</span>}
    </button>
  );

  if (!hasContact) return cellBtn;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="flex min-h-[104px] w-full flex-col items-start bg-[#00854d] px-2 py-1.5 text-left text-white transition-colors cursor-pointer hover:brightness-90"
            onClick={onOpenDetail}
          />
        }
      >
        <span className="text-[10px] font-semibold uppercase opacity-70">Journée complète</span>
        <span className="mt-0.5 line-clamp-2 text-xs font-semibold leading-tight">{labelText ?? "—"}</span>
        {city && <span className="mt-0.5 text-[11px] opacity-85 leading-tight">{city}</span>}
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs space-y-0.5">
        {phone && <p>📞 {phone}</p>}
        {email && <p>✉ {email}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

function HalfCell(props: {
  label: string;
  teamActive: boolean;
  occupied: boolean;
  fullDay: boolean;
  labelText?: string;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  onPick: () => void;
  onOpenDetail?: () => void;
}) {
  const {
    label,
    teamActive,
    occupied,
    fullDay,
    labelText,
    city,
    phone,
    email,
    onPick,
    onOpenDetail,
  } = props;

  if (occupied || fullDay) {
    const hasContact = phone || email;
    const cellClassName = cn(
      "flex min-h-[52px] w-full flex-1 flex-col items-start px-2 py-1.5 text-left transition-colors cursor-pointer hover:brightness-90",
      "bg-[#0073ea] text-white"
    );
    const cellChildren = (
      <>
        <span className="text-[10px] font-semibold uppercase opacity-70">{label}</span>
        <span className="line-clamp-1 text-sm leading-tight font-semibold">{labelText ?? "—"}</span>
        {city && <span className="mt-0.5 text-xs opacity-90 leading-tight">{city}</span>}
        {fullDay && <span className="mt-0.5 text-[10px] opacity-70">Journée complète</span>}
      </>
    );

    if (!hasContact) {
      return (
        <button type="button" className={cellClassName} onClick={onOpenDetail}>
          {cellChildren}
        </button>
      );
    }

    return (
      <Tooltip>
        <TooltipTrigger
          render={<button type="button" className={cellClassName} onClick={onOpenDetail} />}
        >
          {cellChildren}
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs space-y-0.5">
          {phone && <p>📞 {phone}</p>}
          {email && <p>✉ {email}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      type="button"
      disabled={!teamActive}
      onClick={() => teamActive && onPick()}
      className={cn(
        "flex min-h-[52px] w-full flex-1 flex-col items-start px-2 py-1.5 text-left",
        teamActive
          ? "cursor-pointer hover:bg-accent/70"
          : "cursor-not-allowed bg-muted/20"
      )}
    >
      <span className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>
      <span className="text-[11px] text-muted-foreground">{teamActive ? "Libre" : "—"}</span>
    </button>
  );
}

function Legend() {
  return (
    <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
      <span>
        <span className="mr-1 inline-block size-3 rounded bg-[#0073ea] align-middle" /> Occupé (AM/PM)
      </span>
      <span>
        <span className="mr-1 inline-block size-3 rounded bg-[#00854d] align-middle" />{" "}
              Journée complète (8 h)
      </span>
      <span>
        <span className="mr-1 inline-block size-3 rounded border border-dashed align-middle" /> Libre
      </span>
      <span>
        <span className="bg-muted mr-1 inline-block size-3 rounded opacity-50 align-middle" /> Équipe inactive
      </span>
    </div>
  );
}
