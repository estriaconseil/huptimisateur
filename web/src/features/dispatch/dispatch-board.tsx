"use client";

import React from "react";
import {
  addDays,
  addWeeks,
  format,
  parseISO,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, ArrowRightLeft, CalendarDays, CalendarOff, ChevronLeft, ChevronRight, CircleHelp, FileDown, FileText, Loader2, MapPin, Printer, PlusCircle, Search, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { assignJobToSlot, removeSchedule, searchInstallSchedules, updateScheduleColor, type InstallSearchHit } from "@/actions/schedules";
import { updateTeamBlockColor } from "@/actions/blocks";
import { SLOT_COLORS, resolveSlotColor } from "@/lib/slot-colors";
import { getDistanceSuggestionsForJob } from "@/actions/suggestions";
import { getInstallWeekGrid } from "@/actions/dispatch-week";
import { getJobDetails, type JobFullDetail } from "@/actions/jobs";
import { rankJobsFromOrigin, type RankedPickerJob } from "@/actions/picker";
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
import { slotLabel } from "@/services/planning/slot-rules";
import {
  buildDispatchStateMap,
  canAssignFullDay,
  canAssignToHalf,
  getDayState,
  type EnrichedScheduleRow,
} from "@/services/planning/dispatch-state";
import type { AppSettings, EstimatedDurationHours, ScheduleSuggestion, TeamBlock } from "@/types/domain";
import { isTeamSlotBlocked } from "@/services/suggestions/build-candidates";
import { createTeamBlock, createTeamBlockRange, countTeamBlockGroup, deleteTeamBlock, deleteTeamBlockGroup, deleteTeamBlockRange } from "@/actions/blocks";
import { cn } from "@/lib/utils";
import { TravelDuration } from "@/lib/format-travel";
import { cityFromAddress } from "@/lib/address";
import { defaultBusinessWeekMonday } from "@/lib/dispatch/business-week";
import { withQuoteOrigin } from "@/lib/quote-back";

type PickTarget = {
  teamId: string;
  scheduledDate: string;
  half: "am" | "pm";
};

type DetailTarget =
  | { kind: "am"; scheduleId: string; jobId: string; label: string; color: string | null }
  | { kind: "pm"; scheduleId: string; jobId: string; label: string; color: string | null };

type Props = {
  weekDates: string[];
  weekStartLabel: string;
  teams: TeamWithTechs[];
  schedules: EnrichedScheduleRow[];
  jobsForPicker: JobPickerRow[];
  retourAFaireJobs: RetourAFaireRow[];
  settings: AppSettings | null;
  teamBlocks: TeamBlock[];
  initialSuggestJobId: string | null;
  initialSuggestFlag: boolean;
  highlightScheduleId?: string | null;
};

export function DispatchBoard(props: Props) {
  const {
    weekDates,
    weekStartLabel,
    teams,
    schedules,
    jobsForPicker,
    retourAFaireJobs: _retourAFaireJobs,
    settings,
    teamBlocks,
    initialSuggestJobId,
    initialSuggestFlag,
    highlightScheduleId,
  } = props;

  const [highlightId, setHighlightId] = useState<string | null>(highlightScheduleId ?? null);
  useEffect(() => { setHighlightId(highlightScheduleId ?? null); }, [highlightScheduleId]);

  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const threshold = settings?.full_day_threshold_hours ?? 8;
  const stateMap = useMemo(() => buildDispatchStateMap(schedules), [schedules]);

  const [pickOpen, setPickOpen] = useState(false);
  const [pickTarget, setPickTarget] = useState<PickTarget | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pickSearch, setPickSearch] = useState("");
  const [pickerRanked, setPickerRanked] = useState<RankedPickerJob[] | null>(null);
  const [pickerRankLoading, setPickerRankLoading] = useState(false);
  const [blockNotes, setBlockNotes] = useState("");
  const [blockFullDay, setBlockFullDay] = useState(false);
  /** Couleur choisie pour un nouveau blocage */
  const [blockColor, setBlockColor] = useState<string | null>(null);
  /** Couleur du créneau affiché dans le dialog de détail */
  const [scheduleColor, setScheduleColor] = useState<string | null>(null);
  /** Onglet de la modale créneau : jobs à placer vs blocage (comme ventes) */
  const [pickTab, setPickTab] = useState<"jobs" | "block">("jobs");
  const [blockStartDate, setBlockStartDate] = useState("");
  const [blockEndDate, setBlockEndDate] = useState("");
  const [blockSuccessMsg, setBlockSuccessMsg] = useState<string | null>(null);
  const [blockToDelete, setBlockToDelete] = useState<TeamBlock | null>(null);
  /** "day" = 1 ligne, "group" = toute la plage group_id */
  const [blockDeleteMode, setBlockDeleteMode] = useState<"day" | "group">("day");
  /** Nombre réel de jours dans le groupe (chargé depuis le serveur) */
  const [groupCount, setGroupCount] = useState<number | null>(null);
  /** Outil de nettoyage plage dans l'onglet Bloquer */
  const [cleanupTeamId, setCleanupTeamId] = useState("");
  const [cleanupStart, setCleanupStart] = useState("");
  const [cleanupEnd, setCleanupEnd] = useState("");
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null);
  const [pickHelpOpen, setPickHelpOpen] = useState(false);
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

  const searchedJobsForPicker = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    if (!q) return compatibleJobsForPicker;
    return compatibleJobsForPicker.filter((job) => {
      const hay = [
        job.clients?.name,
        job.clients?.city,
        job.installation_address?.city,
        job.installation_address?.address_formatted,
        job.installation_info,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [compatibleJobsForPicker, pickSearch]);

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
  /** Schedule à ignorer dans les suggestions (créneau source d'un déplacement / re-placement) */
  const [excludeScheduleId, setExcludeScheduleId] = useState<string | null>(null);
  const [suggestWarning, setSuggestWarning] = useState<string | null>(null);
  const [suggestMode, setSuggestMode] = useState<"list" | "calendar">("list");
  const [suggestExtended, setSuggestExtended] = useState(false);

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

  // ── Recherche client install ──
  const [installSearch, setInstallSearch] = useState("");
  const [installSearchResults, setInstallSearchResults] = useState<InstallSearchHit[]>([]);
  const [installSearchLoading, setInstallSearchLoading] = useState(false);
  const installSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = installSearch.trim();
    if (installSearchDebounce.current) clearTimeout(installSearchDebounce.current);
    if (q.length < 2) { setInstallSearchResults([]); setInstallSearchLoading(false); return; }
    setInstallSearchLoading(true);
    installSearchDebounce.current = setTimeout(() => {
      void searchInstallSchedules(q).then((res) => {
        setInstallSearchLoading(false);
        setInstallSearchResults(res.ok ? res.results : []);
      });
    }, 300);
    return () => { if (installSearchDebounce.current) clearTimeout(installSearchDebounce.current); };
  }, [installSearch]);

  const handleInstallSearchSelect = (hit: InstallSearchHit) => {
    setInstallSearch("");
    setInstallSearchResults([]);
    router.push(`/dispatch?week=${encodeURIComponent(hit.weekMonday)}&highlight=${encodeURIComponent(hit.scheduleId)}`);
  };

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

  async function confirmBlockSlot() {
    if (!pickTarget) return;
    setPickError(null);

    const start = blockStartDate || pickTarget.scheduledDate;
    const end = blockEndDate || pickTarget.scheduledDate;

    const otherHalfFree = (() => {
      const state = getDayState(stateMap, pickTarget.teamId, pickTarget.scheduledDate);
      const other = pickTarget.half === "am" ? state.pm : state.am;
      const otherBlocked = isTeamSlotBlocked(
        teamBlocks,
        pickTarget.teamId,
        pickTarget.scheduledDate,
        pickTarget.half === "am" ? "pm" : "am"
      );
      return other.kind !== "busy" && !otherBlocked;
    })();

    const slotType =
      blockFullDay && (start === end ? otherHalfFree : true)
        ? "full_day"
        : pickTarget.half;

    startTransition(async () => {
      if (start === end) {
        const res = await createTeamBlock({
          team_id: pickTarget.teamId,
          blocked_date: start,
          slot_type: slotType,
          notes: blockNotes.trim() || null,
          color: blockColor,
        });
        if (!res.ok) {
          setPickError(res.message);
          return;
        }
      } else {
        const res = await createTeamBlockRange({
          team_id: pickTarget.teamId,
          start_date: start,
          end_date: end,
          slot_type: slotType,
          notes: blockNotes.trim() || null,
          weekdays_only: true,
          color: blockColor,
        });
        if (!res.ok) {
          setPickError(res.message);
          return;
        }
        const parts = [`${res.created} jour${res.created > 1 ? "s" : ""} bloqué${res.created > 1 ? "s" : ""}`];
        if (res.skippedBlocked) parts.push(`${res.skippedBlocked} déjà bloqué${res.skippedBlocked > 1 ? "s" : ""}`);
        if (res.skippedBusy) parts.push(`${res.skippedBusy} occupé${res.skippedBusy > 1 ? "s" : ""}`);
        setBlockSuccessMsg(parts.join(" · "));
        setPickTab("block");
        setBlockNotes("");
        setBlockFullDay(false);
        router.refresh();
        return;
      }
      setPickTab("jobs");
      setPickOpen(false);
      setPickTarget(null);
      setBlockNotes("");
      setBlockFullDay(false);
      setBlockColor(null);
      setBlockStartDate("");
      setBlockEndDate("");
      router.refresh();
    });
  }

  /** Ouvre le dialog de suppression et charge le vrai count du groupe depuis le serveur */
  function openDeleteBlock(block: TeamBlock) {
    setBlockToDelete(block);
    setBlockDeleteMode(block.group_id ? "group" : "day");
    setGroupCount(null);
    if (block.group_id) {
      void countTeamBlockGroup(block.group_id).then(setGroupCount);
    }
  }

  async function confirmDeleteBlock() {
    if (!blockToDelete) return;
    startTransition(async () => {
      let res: { ok: boolean; message?: string };
      if (blockDeleteMode === "group" && blockToDelete.group_id) {
        res = await deleteTeamBlockGroup(blockToDelete.group_id);
      } else {
        res = await deleteTeamBlock(blockToDelete.id);
      }
      if (!res.ok) {
        setPickError((res as { ok: false; message: string }).message);
        return;
      }
      setBlockToDelete(null);
      setBlockDeleteMode("day");
      router.refresh();
    });
  }

  async function confirmCleanupRange() {
    if (!cleanupTeamId || !cleanupStart || !cleanupEnd) return;
    startTransition(async () => {
      const res = await deleteTeamBlockRange({
        team_id: cleanupTeamId,
        start_date: cleanupStart,
        end_date: cleanupEnd,
      });
      if (!res.ok) {
        setCleanupMsg(`Erreur : ${res.message}`);
        return;
      }
      setCleanupMsg(`${res.deleted} blocage${res.deleted > 1 ? "s" : ""} retiré${res.deleted > 1 ? "s" : ""}.`);
      setCleanupTeamId("");
      setCleanupStart("");
      setCleanupEnd("");
      router.refresh();
    });
  }

  function openPick(teamId: string, dateStr: string, half: "am" | "pm") {
    const team = teams.find((t) => t.id === teamId);
    if (!team?.active) return;
    const state = getDayState(stateMap, teamId, dateStr);
    if (state.fullDay) return;
    if (half === "am" && state.am.kind === "busy") return;
    if (half === "pm" && state.pm.kind === "busy") return;

    setPickError(null);
    setPickSearch("");
    setPickerRanked(null);
    setPickerRankLoading(false);
    setPickerOriginLabel(null);
    setBlockNotes("");
    setBlockFullDay(false);
    setPickTab("jobs");
    setBlockStartDate(dateStr);
    setBlockEndDate(dateStr);
    setBlockSuccessMsg(null);
    setPickTarget({ teamId, scheduledDate: dateStr, half });
    setPickOpen(true);

    /* Détecter si le slot adjacent est occupé pour trier par proximité */
    const adjacentSlot = half === "pm" ? state.am : state.pm;
    if (adjacentSlot.kind === "busy") {
      const adjSched = schedules.find((s) => s.id === adjacentSlot.scheduleId);
      const originGps = adjSched?.job?.installation_address;
      const lat = originGps?.lat ?? null;
      const lng = originGps?.lng ?? null;
      if (lat != null && lng != null) {
        const originLabel = `${adjSched?.job?.clients?.name ?? "job"} (${half === "pm" ? "AM" : "PM"})`;
        setPickerOriginLabel(originLabel);
        setPickerRankLoading(true);
        void rankJobsFromOrigin(
          { lat, lng },
          jobsForPicker.map((j) => ({
            id: j.id,
            lat: j.installation_address?.lat ?? null,
            lng: j.installation_address?.lng ?? null,
          }))
        ).then((res) => {
          setPickerRankLoading(false);
          if (res.ok) setPickerRanked(res.ranked);
        });
      }
    }
  }

  function openDetail(_teamId: string, _dateStr: string, detailTarget: DetailTarget) {
    setDeleteConfirm(false);
    setDetail(detailTarget);
    setScheduleColor(detailTarget.color);
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
      setDeleteConfirm(false);
      setDetailOpen(false);
      setDetail(null);
      router.refresh();
    });
  }

  /** Même appel que le pipeline installation : 4 semaines, puis 8 si vide. */
  function loadRankedSuggestions(jobId: string, sourceScheduleId: string | null) {
    setSuggestJobId(jobId);
    setExcludeScheduleId(sourceScheduleId);
    setSuggestions([]);
    setSuggestWarning(null);
    setSuggestExtended(false);
    setSuggestMode("list");
    setSheetOpen(true);
    setSuggestLoading(true);

    const startWeek = nextAvailableWeekMonday();
    void (async () => {
      const res4 = await getDistanceSuggestionsForJob(jobId, startWeek, undefined, sourceScheduleId, 4);
      if (!res4.ok) {
        setSuggestLoading(false);
        setSuggestWarning(res4.message);
        return;
      }
      if (res4.warning) {
        setSuggestions(res4.suggestions);
        setSuggestWarning(res4.warning);
        setSuggestLoading(false);
        return;
      }
      if (res4.suggestions.length > 0) {
        setSuggestions(res4.suggestions);
        setSuggestLoading(false);
        return;
      }

      setSuggestExtended(true);
      const res8 = await getDistanceSuggestionsForJob(jobId, startWeek, undefined, sourceScheduleId, 8);
      if (res8.ok) {
        setSuggestions(res8.suggestions);
        setSuggestWarning(
          res8.suggestions.length === 0
            ? "Aucune plage disponible dans les 8 prochaines semaines. Vérifiez les équipes actives."
            : null
        );
      } else {
        setSuggestWarning(res8.message);
      }
      setSuggestLoading(false);
    })();
  }

  function openSuggestionsForJob(
    jobId: string,
    opts: { excludeScheduleId?: string | null } = {}
  ) {
    loadRankedSuggestions(jobId, opts.excludeScheduleId ?? null);
  }

  function moveAppointment() {
    if (!detail) return;
    const jobId = detail.jobId;
    const sourceScheduleId = detail.scheduleId;
    setDeleteConfirm(false);
    setDetailOpen(false);
    setDetailJobFull(null);
    loadRankedSuggestions(jobId, sourceScheduleId);
  }

  async function applySuggestion(s: ScheduleSuggestion) {
    if (!suggestJobId || !suggestJobMeta) return;
    const half: "am" | "pm" = s.slot === "pm" ? "pm" : "am";
    startTransition(async () => {
      // assignJobToSlot remplace tout schedule planned de la job (pas de doublon)
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
      setExcludeScheduleId(null);
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
            onClick={() => navigateToMonday(defaultBusinessWeekMonday())}
          >
            Cette semaine
          </Button>
        </div>

        {/* Recherche client install */}
        <div className="relative">
          <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5 text-sm focus-within:ring-1 focus-within:ring-ring">
            {installSearchLoading
              ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
              : <Search className="size-3.5 shrink-0 text-muted-foreground" />
            }
            <input
              value={installSearch}
              onChange={(e) => setInstallSearch(e.target.value)}
              placeholder="Rechercher un client…"
              className="w-40 bg-transparent outline-none placeholder:text-muted-foreground"
              aria-label="Rechercher une installation"
            />
            {installSearch && (
              <button
                type="button"
                onClick={() => { setInstallSearch(""); setInstallSearchResults([]); }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Effacer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {/* Résultats */}
          {installSearchResults.length > 0 && (
            <div className="absolute left-0 z-50 mt-1 w-72 rounded-lg border bg-background shadow-lg">
              {installSearchResults.map((hit) => (
                <button
                  key={hit.scheduleId}
                  type="button"
                  onClick={() => handleInstallSearchSelect(hit)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted first:rounded-t-lg last:rounded-b-lg"
                >
                  <span className="font-medium">{hit.clientName}</span>
                  <span className="text-xs text-muted-foreground">
                    {hit.scheduledDate} · {hit.teamName}
                    {hit.clientCity ? ` · ${hit.clientCity}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          {installSearch.trim().length >= 2 && !installSearchLoading && installSearchResults.length === 0 && (
            <div className="absolute left-0 z-50 mt-1 w-64 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground shadow-lg">
              Aucune installation trouvée.
            </div>
          )}
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
            variant="outline"
            size="sm"
            className="gap-1.5"
            title="PDF de la semaine — texte à copier dans Excel (Ian)"
            onClick={() => {
              const week = weekDates[0];
              if (!week) return;
              window.open(
                `/api/pdf/dispatch-semaine?week=${encodeURIComponent(week)}`,
                "_blank",
                "noopener,noreferrer"
              );
            }}
          >
            <FileDown className="size-3.5" />
            Export Ian
          </Button>
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
                    const fullDayBlock =
                      !amBusy &&
                      !pmBusy &&
                      teamBlocks.find(
                        (b) =>
                          b.team_id === team.id &&
                          b.blocked_date === dateStr &&
                          b.slot_type === "full_day"
                      );
                    const amBlocked = !amBusy && !fullDayBlock && isTeamSlotBlocked(teamBlocks, team.id, dateStr, "am");
                    const pmBlocked = !pmBusy && !fullDayBlock && isTeamSlotBlocked(teamBlocks, team.id, dateStr, "pm");
                    /* Journée complète : un seul schedule couvre AM+PM */
                    const fullDayBusy = state.fullDay ? amBusy : null;
                    return (
                      <td key={`${team.id}-${dateStr}`} className="border border-border bg-inherit p-0 align-top">
                        {state.fullDay && fullDayBusy ? (
                          /* ── Bloc journée complète (job) ── */
                          <FullDayCell
                            labelText={fullDayBusy.label}
                            city={fullDayBusy.city}
                            phone={fullDayBusy.phone}
                            email={fullDayBusy.email}
                            missingSerial={fullDayBusy.missingSerial}
                            color={fullDayBusy.color}
                            highlighted={highlightId === fullDayBusy.scheduleId}
                            onOpenDetail={() =>
                              openDetail(team.id, dateStr, {
                                kind: "am",
                                scheduleId: fullDayBusy.scheduleId,
                                jobId: fullDayBusy.jobId,
                                label: fullDayBusy.label,
                                color: fullDayBusy.color,
                              })
                            }
                          />
                        ) : fullDayBlock ? (
                          /* ── Blocage journée complète ── */
                          (() => {
                            const { bg, text } = resolveSlotColor(fullDayBlock.color, "#52525b", "#ffffff");
                            return (
                              <button
                                type="button"
                                className="flex h-[104px] w-full flex-col items-start overflow-hidden px-2 py-1.5 text-left transition-colors hover:brightness-90"
                                style={{ backgroundColor: bg, color: text }}
                                title="Cliquer pour retirer / modifier le blocage"
                                onClick={() => openDeleteBlock(fullDayBlock)}
                              >
                                <span className="text-[10px] font-semibold uppercase opacity-80">Journée bloquée</span>
                                <span className="mt-0.5 line-clamp-2 text-sm font-semibold leading-tight">
                                  {fullDayBlock.notes?.trim() || "Bloqué"}
                                </span>
                              </button>
                            );
                          })()
                        ) : (
                          /* ── Deux demi-créneaux ── */
                          <div className="flex flex-col divide-y h-[104px]">
                            <HalfCell
                              label="AM"
                              teamActive={team.active}
                              occupied={!!amBusy}
                              blocked={amBlocked}
                              teamId={team.id}
                              dateStr={dateStr}
                              half="am"
                              teamBlocks={teamBlocks}
                              fullDay={false}
                              labelText={amBusy?.label}
                              city={amBusy?.city}
                              phone={amBusy?.phone}
                              email={amBusy?.email}
                              missingSerial={amBusy?.missingSerial}
                              scheduleColor={amBusy?.color ?? null}
                              highlighted={!!amBusy && highlightId === amBusy.scheduleId}
                              onPick={() => openPick(team.id, dateStr, "am")}
                              onRequestDeleteBlock={openDeleteBlock}
                              onOpenDetail={
                                amBusy
                                  ? () =>
                                      openDetail(team.id, dateStr, {
                                        kind: "am",
                                        scheduleId: amBusy.scheduleId,
                                        jobId: amBusy.jobId,
                                        label: amBusy.label,
                                        color: amBusy.color,
                                      })
                                  : undefined
                              }
                            />
                            <HalfCell
                              label="PM"
                              teamActive={team.active}
                              occupied={!!pmBusy}
                              blocked={pmBlocked}
                              teamId={team.id}
                              dateStr={dateStr}
                              half="pm"
                              teamBlocks={teamBlocks}
                              fullDay={false}
                              labelText={pmBusy?.label}
                              city={pmBusy?.city}
                              phone={pmBusy?.phone}
                              email={pmBusy?.email}
                              missingSerial={pmBusy?.missingSerial}
                              scheduleColor={pmBusy?.color ?? null}
                              highlighted={!!pmBusy && highlightId === pmBusy.scheduleId}
                              onPick={() => openPick(team.id, dateStr, "pm")}
                              onRequestDeleteBlock={openDeleteBlock}
                              onOpenDetail={
                                pmBusy
                                  ? () =>
                                      openDetail(team.id, dateStr, {
                                        kind: "pm",
                                        scheduleId: pmBusy.scheduleId,
                                        jobId: pmBusy.jobId,
                                        label: pmBusy.label,
                                        color: pmBusy.color,
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

      <Dialog
        open={pickOpen}
        onOpenChange={(o) => {
          setPickOpen(o);
          if (!o) {
            setPickerRanked(null);
            setPickerOriginLabel(null);
            setPickSearch("");
            setPickTab("jobs");
            setBlockNotes("");
            setBlockFullDay(false);
            setBlockColor(null);
            setBlockSuccessMsg(null);
            setPickHelpOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg flex flex-col gap-0 overflow-hidden max-h-[90vh] p-0">
          <DialogHeader className="shrink-0 space-y-1 px-6 pt-6 pb-3">
            <DialogTitle>
              {pickTab === "block" ? "Bloquer une période" : "Affecter une job"}
            </DialogTitle>
            <DialogDescription className="inline-flex items-center gap-1">
              <span>
                Créneau {pickTarget?.half === "am" ? "AM" : "PM"}
                {pickTarget ? ` — ${pickTarget.scheduledDate}` : ""}
              </span>
              {pickTab === "jobs" && (
                <button
                  type="button"
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Aide"
                  aria-expanded={pickHelpOpen}
                  onClick={() => setPickHelpOpen((v) => !v)}
                >
                  <CircleHelp className="size-3.5" />
                </button>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Onglets Jobs | Bloquer */}
          <div className="flex border-b px-6 shrink-0">
            <button
              type="button"
              onClick={() => { setPickTab("jobs"); setPickError(null); setBlockSuccessMsg(null); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                pickTab === "jobs"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Search className="size-3.5" />
              Jobs
            </button>
            <button
              type="button"
              onClick={() => { setPickTab("block"); setPickError(null); setPickHelpOpen(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                pickTab === "block"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarOff className="size-3.5" />
              Bloquer
            </button>
          </div>

          <div className="flex flex-col gap-3 px-6 py-4 min-h-0 overflow-y-auto flex-1">
            {pickHelpOpen && pickTab === "jobs" && (
              <div className="shrink-0 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1.5">
                <p>
                  Choisis une job à placer sur ce créneau. Pour réserver des dates sans client,
                  utilise l&apos;onglet <strong className="text-foreground">Bloquer</strong>.
                </p>
                {pickTarget && (() => {
                  const st = getDayState(stateMap, pickTarget.teamId, pickTarget.scheduledDate);
                  const adj = pickTarget.half === "pm" ? st.am : st.pm;
                  if (adj.kind === "busy") {
                    return (
                      <p className="text-amber-700 dark:text-amber-400">
                        L&apos;autre demi-journée est occupée : seules les jobs de 4 h sont proposées.
                      </p>
                    );
                  }
                  return null;
                })()}
                {pickerOriginLabel && (
                  <p>
                    Les 10 plus proches depuis {pickerOriginLabel} (vol d&apos;oiseau, pas Google).
                    Recherche pour voir les autres.
                  </p>
                )}
              </div>
            )}

            {pickError && <p className="text-destructive text-sm shrink-0">{pickError}</p>}
            {blockSuccessMsg && (
              <div className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 flex items-center justify-between gap-2">
                <span>{blockSuccessMsg}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0"
                  onClick={() => {
                    setBlockSuccessMsg(null);
                    setPickOpen(false);
                    setPickTarget(null);
                  }}
                >
                  Fermer
                </Button>
              </div>
            )}

            {pickTab === "jobs" ? (
              <>
                <div className="relative shrink-0">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={pickSearch}
                    onChange={(e) => setPickSearch(e.target.value)}
                    placeholder="Nom, ville ou adresse…"
                    className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    autoFocus
                  />
                </div>

                <div className="h-72 shrink-0 overflow-y-auto rounded-lg border bg-background">
                  {searchedJobsForPicker.length === 0 ? (
                    <p className="text-muted-foreground p-4 text-sm">
                      {pickSearch.trim()
                        ? `Aucun client ne correspond à « ${pickSearch.trim()} ».`
                        : jobsForPicker.length > 0
                          ? "Aucune job de 4 h disponible pour ce créneau."
                          : "Aucune job à planifier."}
                    </p>
                  ) : (
                    <ul className="space-y-1 p-2">
                      {(() => {
                        const q = pickSearch.trim();
                        const list = searchedJobsForPicker;
                        const rankMap =
                          !q && pickerRanked && pickerRanked.length > 0
                            ? new Map(pickerRanked.map((r) => [r.id, r]))
                            : null;

                        let orderedJobs = list;
                        let rankedPairs: { job: (typeof list)[number]; rank: RankedPickerJob }[] = [];

                        if (rankMap) {
                          rankedPairs = pickerRanked!
                            .map((r) => {
                              const job = list.find((j) => j.id === r.id);
                              return job ? { job, rank: r } : null;
                            })
                            .filter(
                              (x): x is { job: (typeof list)[number]; rank: RankedPickerJob } =>
                                x !== null
                            );
                          const unranked = list.filter((j) => !rankMap.has(j.id));
                          orderedJobs = [...rankedPairs.map((x) => x.job), ...unranked];
                        }

                        return orderedJobs.map((job) => {
                          const rank = rankedPairs.find((r) => r.job.id === job.id)?.rank ?? null;
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
                                    <span className="font-medium">
                                      {job.clients?.name ?? "Sans nom"}
                                    </span>
                                    {(job.installation_address?.city ?? job.clients?.city) && (
                                      <span className="text-muted-foreground block text-xs">
                                        📍 {job.installation_address?.city ?? job.clients?.city}
                                      </span>
                                    )}
                                    {job.installation_address?.address_formatted && (
                                      <span className="text-muted-foreground block text-xs truncate">
                                        {job.installation_address.address_formatted}
                                      </span>
                                    )}
                                    <span className="text-muted-foreground block text-xs">
                                      {job.estimated_duration_hours} h
                                    </span>
                                  </div>
                                  {rank && (
                                    <div className="shrink-0 text-right text-xs tabular-nums">
                                      <TravelDuration
                                        seconds={rank.durationSeconds}
                                        className="block font-medium"
                                        numberClassName="font-medium"
                                      />
                                    </div>
                                  )}
                                </div>
                              </button>
                            </li>
                          );
                        });
                      })()}
                    </ul>
                  )}
                </div>

                <DialogFooter className="shrink-0 sm:justify-end px-0">
                  <Button type="button" variant="ghost" onClick={() => setPickOpen(false)}>
                    Annuler
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                {pickTarget && (
                  <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-800 font-medium">
                    Blocage pour : {teams.find((t) => t.id === pickTarget.teamId)?.name ?? "équipe"}
                    {" · "}
                    {pickTarget.half.toUpperCase()}
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Durée rapide</p>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      if (!pickTarget) return null;
                      const weekMon = format(
                        startOfWeek(new Date(pickTarget.scheduledDate + "T12:00:00"), { weekStartsOn: 1 }),
                        "yyyy-MM-dd"
                      );
                      const weekFri = format(addDays(new Date(weekMon + "T12:00:00"), 4), "yyyy-MM-dd");
                      const twoFri = format(addDays(new Date(weekMon + "T12:00:00"), 11), "yyyy-MM-dd");
                      const presets = [
                        { label: "Ce créneau", start: pickTarget.scheduledDate, end: pickTarget.scheduledDate },
                        { label: "Cette semaine (lun–ven)", start: weekMon, end: weekFri },
                        { label: "2 semaines", start: weekMon, end: twoFri },
                      ];
                      return presets.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => {
                            setBlockStartDate(p.start);
                            setBlockEndDate(p.end);
                            if (p.start !== p.end) setBlockFullDay(true);
                          }}
                          className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted transition-colors"
                        >
                          {p.label}
                        </button>
                      ));
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Date début</label>
                    <input
                      type="date"
                      value={blockStartDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setBlockStartDate(v);
                        if (blockEndDate && v !== blockEndDate) setBlockFullDay(true);
                      }}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Date fin</label>
                    <input
                      type="date"
                      value={blockEndDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setBlockEndDate(v);
                        if (blockStartDate && v !== blockStartDate) setBlockFullDay(true);
                      }}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Libellé (ex. vacances, nom client)
                  </label>
                  <input
                    type="text"
                    value={blockNotes}
                    onChange={(e) => setBlockNotes(e.target.value)}
                    placeholder="Ex. Vacances équipe · Tremblay 2 jours"
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    autoFocus
                  />
                </div>
                {/* Couleur de la case */}
                <SlotColorPicker value={blockColor} onChange={setBlockColor} />
                {(() => {
                  if (!pickTarget) return null;
                  const isRange = blockStartDate && blockEndDate && blockStartDate !== blockEndDate;
                  if (isRange) {
                    return (
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={blockFullDay}
                          onChange={(e) => setBlockFullDay(e.target.checked)}
                          className="rounded border-input"
                        />
                        Journée complète (AM + PM) chaque jour
                      </label>
                    );
                  }
                  const st = getDayState(stateMap, pickTarget.teamId, pickTarget.scheduledDate);
                  const other = pickTarget.half === "am" ? st.pm : st.am;
                  const otherBlocked = isTeamSlotBlocked(
                    teamBlocks,
                    pickTarget.teamId,
                    pickTarget.scheduledDate,
                    pickTarget.half === "am" ? "pm" : "am"
                  );
                  const canFullDay = other.kind !== "busy" && !otherBlocked;
                  return canFullDay ? (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={blockFullDay}
                        onChange={(e) => setBlockFullDay(e.target.checked)}
                        className="rounded border-input"
                      />
                      Bloquer la journée complète (AM + PM)
                    </label>
                  ) : null;
                })()}
                <p className="text-[11px] text-muted-foreground">
                  Les samedis/dimanches sont ignorés. Les jours déjà bloqués ou occupés sont sautés.
                </p>
                <DialogFooter className="shrink-0 gap-2 sm:justify-end px-0 pt-1">
                  <Button type="button" variant="ghost" onClick={() => setPickOpen(false)} disabled={pending}>
                    Annuler
                  </Button>
                  <Button type="button" onClick={() => void confirmBlockSlot()} disabled={pending}>
                    {pending ? "…" : "Bloquer cette période"}
                  </Button>
                </DialogFooter>

                {/* ── Outil de nettoyage — retirer une plage existante sans group_id ── */}
                <details className="mt-2">
                  <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground select-none">
                    Retirer une plage existante (ancien blocage sans groupe)
                  </summary>
                  <div className="mt-3 space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-xs text-muted-foreground">
                      Supprime tous les blocages d&apos;une équipe entre deux dates, peu importe le libellé.
                    </p>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Équipe</label>
                      <select
                        value={cleanupTeamId}
                        onChange={(e) => setCleanupTeamId(e.target.value)}
                        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">— choisir —</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Du</label>
                        <input type="date" value={cleanupStart} onChange={(e) => setCleanupStart(e.target.value)}
                          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Au</label>
                        <input type="date" value={cleanupEnd} onChange={(e) => setCleanupEnd(e.target.value)}
                          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                      </div>
                    </div>
                    {cleanupMsg && (
                      <p className={`text-xs font-medium ${cleanupMsg.startsWith("Erreur") ? "text-destructive" : "text-emerald-700"}`}>
                        {cleanupMsg}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      disabled={pending || !cleanupTeamId || !cleanupStart || !cleanupEnd}
                      onClick={() => void confirmCleanupRange()}
                    >
                      {pending ? "…" : "Retirer tous les blocages de cette plage"}
                    </Button>
                  </div>
                </details>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!blockToDelete} onOpenChange={(o) => { if (!o) { setBlockToDelete(null); setBlockDeleteMode("day"); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Retirer le blocage ?</DialogTitle>
            <DialogDescription>
              {blockToDelete?.notes?.trim()
                ? `« ${blockToDelete.notes.trim()} » — ${blockToDelete.slot_type === "full_day" ? "journée complète" : blockToDelete.slot_type.toUpperCase()} du ${blockToDelete.blocked_date}.`
                : `Créneau ${blockToDelete?.slot_type === "full_day" ? "journée complète" : blockToDelete?.slot_type?.toUpperCase()} du ${blockToDelete?.blocked_date}.`}
            </DialogDescription>
          </DialogHeader>

          {/* Si la ligne fait partie d'une plage groupée → 2 choix */}
          {blockToDelete?.group_id && (
            <div className="space-y-2 py-1">
              <p className="text-sm text-muted-foreground">
                Cette case fait partie d&apos;une plage de{" "}
                <strong>
                  {groupCount === null ? "…" : `${groupCount} jour${groupCount > 1 ? "s" : ""}`}
                </strong>.{" "}
                Que veux-tu retirer ?
              </p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border p-3 hover:bg-muted/40">
                  <input type="radio" name="deleteMode" value="day" checked={blockDeleteMode === "day"} onChange={() => setBlockDeleteMode("day")} />
                  <span>Ce jour seulement ({blockToDelete.blocked_date})</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border p-3 hover:bg-muted/40">
                  <input type="radio" name="deleteMode" value="group" checked={blockDeleteMode === "group"} onChange={() => setBlockDeleteMode("group")} />
                  <span>
                    Toute la période{" "}
                    {groupCount !== null ? `— ${groupCount} jour${groupCount > 1 ? "s" : ""}` : ""}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Modifier la couleur sans supprimer */}
          {blockToDelete && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-medium text-muted-foreground">Modifier la couleur</p>
              <SlotColorPicker
                value={blockToDelete.color}
                onChange={(c) => {
                  void updateTeamBlockColor(blockToDelete.id, c).then((res) => {
                    if (res.ok) {
                      setBlockToDelete(null);
                      setBlockDeleteMode("day");
                      router.refresh();
                    }
                  });
                }}
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => { setBlockToDelete(null); setBlockDeleteMode("day"); }} disabled={pending}>
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDeleteBlock()} disabled={pending}>
              {pending ? "…" : blockDeleteMode === "group" ? "Retirer toute la période" : "Retirer ce jour"}
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
                  {(detailJobFull.clientCity || cityFromAddress(detailJobFull.clientAddress)) && (
                    <p>
                      {detailJobFull.clientCity ?? cityFromAddress(detailJobFull.clientAddress)}
                      {detailJobFull.clientPostal ? `, ${detailJobFull.clientPostal}` : ""}
                    </p>
                  )}
                </div>
              )}

              <a
                href={withQuoteOrigin(`/ventes/soumission/${detailJobFull.jobId}`, "dispatch", weekStartLabel)}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                <FileText className="size-4 text-muted-foreground" />
                {detailJobFull.hasQuote ? "Ouvrir la soumission" : "Créer / voir la soumission"}
              </a>
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

          {/* Couleur de la case */}
          {detail && !deleteConfirm && (
            <div className="pt-1">
              <SlotColorPicker
                value={scheduleColor}
                onChange={(c) => {
                  setScheduleColor(c);
                  void updateScheduleColor(detail.scheduleId, c).then((res) => {
                    if (res.ok) router.refresh();
                  });
                }}
              />
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

            {/* 2 — Soumission */}
            {detail?.jobId && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setDetailOpen(false);
                        router.push(withQuoteOrigin(`/ventes/soumission/${detail.jobId}`, "dispatch", weekStartLabel));
                      }}
                    />
                  }
                >
                  <FileText className="size-4" />
                </TooltipTrigger>
                <TooltipContent>
                  {detailJobFull?.hasQuote ? "Ouvrir la soumission" : "Créer / voir la soumission"}
                </TooltipContent>
              </Tooltip>
            )}

            {/* 3 — Optimiser */}
            {detail?.jobId && (
              <Tooltip>
                <TooltipTrigger render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setDetailOpen(false);
                      void openSuggestionsForJob(detail.jobId, {
                        excludeScheduleId: detail.scheduleId,
                      });
                    }}
                  />
                }>
                  <MapPin className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Optimiser le trajet</TooltipContent>
              </Tooltip>
            )}

            {/* 4 — Déplacer */}
            <Tooltip>
              <TooltipTrigger render={
                <Button type="button" variant="outline" size="icon" disabled={pending} onClick={() => moveAppointment()} />
              }>
                <ArrowRightLeft className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Déplacer vers un autre créneau</TooltipContent>
            </Tooltip>

            {/* 5 — Retirer */}
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

      <Dialog open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) setExcludeScheduleId(null); }}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0">
          <div className="px-6 pt-6 pb-4 border-b">
            <DialogHeader>
              <DialogTitle>Déplacer le rendez-vous</DialogTitle>
              <DialogDescription>
                Même classement que le pipeline installation. Le créneau actuel est exclu.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 flex rounded-lg border overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setSuggestMode("list")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 font-medium transition-colors",
                  suggestMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                <Sparkles className="size-3" />
                Meilleur créneau
              </button>
              <button
                type="button"
                onClick={() => setSuggestMode("calendar")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 font-medium transition-colors border-l",
                  suggestMode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                <CalendarDays className="size-3" />
                Par calendrier
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {suggestMode === "list" && (
              <>
                {suggestLoading && (
                  <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
                    <Loader2 className="size-4 animate-spin" />
                    {suggestExtended
                      ? "Aucun créneau sur 4 semaines — recherche jusqu'à 8 semaines…"
                      : "Calcul des distances en cours…"}
                  </div>
                )}
                {suggestWarning && !suggestLoading && (
                  <p className="text-sm rounded-md bg-destructive/10 text-destructive px-3 py-2">{suggestWarning}</p>
                )}
                {!suggestLoading && suggestExtended && suggestions.length > 0 && (
                  <p className="mb-2 text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-1.5 border border-amber-200">
                    Les 4 prochaines semaines sont complètes — résultats sur les semaines 5 à 8.
                  </p>
                )}
                <ul className="space-y-2 pb-4">
                  {suggestions.slice(0, 15).map((s, idx) => (
                    <li key={`${s.teamId}-${s.date}-${s.slot}-${idx}`}>
                      <button
                        type="button"
                        disabled={pending}
                        className="border-border hover:bg-accent w-full rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-50"
                        onClick={() => void applySuggestion(s)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold capitalize">
                            {format(parseISO(s.date), "EEEE d MMMM", { locale: fr })}
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{slotLabel(s.slot)}</span>
                          </span>
                          <TravelDuration
                            seconds={s.durationSeconds}
                            numberClassName="font-semibold"
                            neutral={s.slot === "full_day"}
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{s.teamName}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {suggestMode === "calendar" && suggestJobId && suggestJobMeta && (
              <MoveWeekPicker
                jobId={suggestJobId}
                durationHours={suggestJobMeta.estimated_duration_hours}
                assigning={pending}
                excludeScheduleId={excludeScheduleId}
                precomputedSuggestions={suggestions}
                onPick={(teamId, date, half) => {
                  void applySuggestion({
                    teamId,
                    teamName: "",
                    date,
                    slot: half,
                    distanceMeters: null,
                    durationSeconds: null,
                  });
                }}
              />
            )}
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
  missingSerial?: boolean;
  color?: string | null;
  highlighted?: boolean;
  onOpenDetail?: () => void;
}) {
  const { labelText, city, phone, email, missingSerial, color, highlighted, onOpenDetail } = props;
  const hasContact = phone || email;

  const { bg, text } = resolveSlotColor(color, "#f1f5f9", "#334155");

  const cellClassName = cn(
    "flex h-[104px] w-full flex-col items-start overflow-hidden px-2 py-1.5 text-left transition-colors cursor-pointer hover:brightness-90",
    highlighted && "ring-2 ring-inset ring-white animate-pulse",
  );

  const cellChildren = (
    <>
      <div className="flex w-full items-start justify-between gap-1 shrink-0">
        <span className="text-[10px] font-semibold uppercase opacity-80">Journée complète</span>
        {missingSerial && (
          <span className="inline-flex items-center gap-0.5 rounded border border-orange-400 bg-orange-50 px-1 text-[10px] font-semibold text-orange-700">
            <AlertTriangle className="size-3" />
            #série
          </span>
        )}
      </div>
      <span className="mt-0.5 line-clamp-1 text-sm font-semibold leading-tight">{labelText ?? "—"}</span>
      {city && <span className="mt-0.5 line-clamp-1 text-xs opacity-90 leading-tight">{city}</span>}
    </>
  );

  if (!hasContact) {
    return (
      <button type="button" className={cellClassName} style={{ backgroundColor: bg, color: text }} onClick={onOpenDetail}>
        {cellChildren}
      </button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" className={cellClassName} style={{ backgroundColor: bg, color: text }} onClick={onOpenDetail} />
        }
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

function HalfCell(props: {
  label: string;
  teamActive: boolean;
  occupied: boolean;
  blocked?: boolean;
  teamId?: string;
  dateStr?: string;
  half?: "am" | "pm";
  teamBlocks?: TeamBlock[];
  fullDay: boolean;
  labelText?: string;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  missingSerial?: boolean;
  /** Couleur personnalisée du créneau planifié. */
  scheduleColor?: string | null;
  highlighted?: boolean;
  onPick: () => void;
  onRequestDeleteBlock?: (block: TeamBlock) => void;
  onOpenDetail?: () => void;
}) {
  const {
    label,
    teamActive,
    occupied,
    blocked,
    teamId,
    dateStr,
    half,
    teamBlocks,
    fullDay,
    labelText,
    city,
    phone,
    email,
    missingSerial,
    scheduleColor,
    highlighted,
    onPick,
    onRequestDeleteBlock,
    onOpenDetail,
  } = props;

  if (blocked && teamId && dateStr && half && teamBlocks) {
    const block = teamBlocks.find(
      (b) => b.team_id === teamId && b.blocked_date === dateStr && (b.slot_type === half || b.slot_type === "full_day")
    );
    const { bg, text } = resolveSlotColor(block?.color ?? null, "#52525b", "#ffffff");
    return (
      <button
        type="button"
        className="flex h-[52px] w-full flex-1 flex-col items-start px-2 py-1.5 text-left transition-colors hover:brightness-90"
        style={{ backgroundColor: bg, color: text }}
        title="Cliquer pour retirer / modifier le blocage"
        onClick={() => {
          if (block) onRequestDeleteBlock?.(block);
        }}
      >
        <span className="text-[10px] font-semibold uppercase">{label}</span>
        <span className="line-clamp-1 text-[11px] font-medium">
          {block?.notes?.trim() || "Bloqué"}
        </span>
      </button>
    );
  }

  if (occupied || fullDay) {
    const hasContact = phone || email;
    const { bg, text } = resolveSlotColor(scheduleColor ?? null, "#f1f5f9", "#334155");
    const cellClassName = cn(
      "flex h-[52px] w-full flex-1 flex-col items-start overflow-hidden px-2 py-1 text-left transition-colors cursor-pointer hover:brightness-90",
      highlighted && "ring-2 ring-inset ring-white animate-pulse",
    );
    const cellChildren = (
      <>
        <div className="flex w-full items-start justify-between gap-1 shrink-0">
          <span className="text-[10px] font-semibold uppercase opacity-70 leading-none">{label}</span>
          {missingSerial && (
            <span className="inline-flex items-center gap-0.5 rounded border border-orange-400 bg-orange-50 px-1 text-[10px] font-semibold leading-none text-orange-700">
              <AlertTriangle className="size-3" />
              #série
            </span>
          )}
        </div>
        <span className="line-clamp-1 text-sm leading-tight font-semibold">{labelText ?? "—"}</span>
        {city && <span className="line-clamp-1 text-[11px] opacity-90 leading-tight">{city}</span>}
      </>
    );

    if (!hasContact) {
      return (
        <button type="button" className={cellClassName} style={{ backgroundColor: bg, color: text }} onClick={onOpenDetail}>
          {cellChildren}
        </button>
      );
    }

    return (
      <Tooltip>
        <TooltipTrigger
          render={<button type="button" className={cellClassName} style={{ backgroundColor: bg, color: text }} onClick={onOpenDetail} />}
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
        "flex h-[52px] w-full flex-1 flex-col items-start px-2 py-1.5 text-left",
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

/** Sélecteur de couleur de case (blocages et créneaux planifiés). */
function SlotColorPicker({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (color: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Couleur de la case</p>
      <div className="flex flex-wrap gap-1.5">
        {/* Aucune couleur = défaut */}
        <button
          type="button"
          title="Couleur par défaut"
          onClick={() => onChange(null)}
          className={cn(
            "size-6 rounded-full border-2 bg-white flex items-center justify-center transition-all",
            !value ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-muted-foreground"
          )}
        >
          <span className="text-[10px] text-muted-foreground font-bold">✕</span>
        </button>
        {SLOT_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onClick={() => onChange(c.value)}
            className={cn(
              "size-6 rounded-full border-2 transition-all hover:scale-110",
              value === c.value ? "border-foreground ring-2 ring-foreground/30 scale-110" : "border-transparent"
            )}
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>
      {value && (
        <p className="text-[11px] text-muted-foreground">
          {SLOT_COLORS.find((c) => c.value === value)?.label}
        </p>
      )}
    </div>
  );
}

function Legend() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Légende {expanded ? "▴" : "▾"}
      </button>

      {expanded && (
        <div className="w-full flex flex-wrap gap-x-4 gap-y-2 pt-1 border-t border-border/40">
          {/* Couleurs de base */}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-3.5 rounded border border-slate-300 shrink-0" style={{ backgroundColor: "#f1f5f9" }} /> Occupé
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-3.5 rounded border-2 border-slate-300 shrink-0" /> Libre
          </span>
          <span className="inline-flex items-center gap-1 opacity-45">
            <span className="inline-block size-3.5 rounded border border-slate-300 shrink-0" style={{ backgroundColor: "#f1f5f9" }} /> Équipe inactive
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-3.5 rounded shrink-0" style={{ backgroundColor: "#52525b" }} /> Bloqué
          </span>
          <span className="inline-flex items-center gap-0.5 rounded border border-orange-400 bg-orange-50 px-1 text-orange-700">
            <AlertTriangle className="size-3" /> # série
          </span>
          {/* Séparateur */}
          <span className="w-full border-t border-border/30" />
          {/* Codes couleur custom */}
          {SLOT_COLORS.map((c) => (
            <span key={c.value} className="flex items-center gap-1">
              <span className="inline-block size-3 rounded shrink-0" style={{ backgroundColor: c.hex }} />
              {c.label.split(" — ")[1]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function nextAvailableWeekMonday(): string {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  const thisFridayIso = format(addDays(thisMonday, 4), "yyyy-MM-dd");
  if (thisFridayIso >= todayIso) return format(thisMonday, "yyyy-MM-dd");
  return format(addDays(thisMonday, 7), "yyyy-MM-dd");
}

function MoveWeekPicker({
  jobId,
  durationHours,
  assigning,
  excludeScheduleId,
  precomputedSuggestions,
  onPick,
}: {
  jobId: string;
  durationHours: EstimatedDurationHours;
  assigning: boolean;
  excludeScheduleId: string | null;
  precomputedSuggestions: ScheduleSuggestion[];
  onPick: (teamId: string, date: string, half: "am" | "pm") => void;
}) {
  const [monday, setMonday] = useState(nextAvailableWeekMonday);
  const [loading, setLoading] = useState(true);
  const [travelLoading, setTravelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekDates, setWeekDates] = useState<string[]>([]);
  const [teams, setTeams] = useState<TeamWithTechs[]>([]);
  const [schedules, setSchedules] = useState<EnrichedScheduleRow[]>([]);
  const [travelByKey, setTravelByKey] = useState<Map<string, number | null>>(new Map());

  function loadWeek(weekIso: string) {
    setMonday(weekIso);
    setLoading(true);
    setTravelLoading(true);
    setError(null);
    setTravelByKey(new Map());
    void getInstallWeekGrid(weekIso)
      .then((res) => {
        setWeekDates(res.weekDates);
        setTeams(res.teams);
        setSchedules(res.schedules.filter((s) => s.id !== excludeScheduleId));
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Impossible de charger le calendrier.");
        setLoading(false);
      });

    if (precomputedSuggestions.length > 0) {
      const next = new Map<string, number | null>();
      for (const s of precomputedSuggestions) {
        next.set(`${s.teamId}|${s.date}|${s.slot}`, s.durationSeconds);
      }
      setTravelByKey(next);
      setTravelLoading(false);
    } else {
      void getDistanceSuggestionsForJob(jobId, weekIso, undefined, excludeScheduleId, 1).then((res) => {
        const next = new Map<string, number | null>();
        if (res.ok) {
          for (const s of res.suggestions) {
            next.set(`${s.teamId}|${s.date}|${s.slot}`, s.durationSeconds);
          }
        }
        setTravelByKey(next);
        setTravelLoading(false);
      }).catch(() => setTravelLoading(false));
    }
  }

  useEffect(() => {
    loadWeek(monday);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stateMap = useMemo(() => buildDispatchStateMap(schedules), [schedules]);
  const needsFullDay = durationHours === 8;
  const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

  function travelFor(teamId: string, dateStr: string, slot: "am" | "pm" | "full_day") {
    return travelByKey.get(`${teamId}|${dateStr}|${slot}`) ?? null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => loadWeek(format(subWeeks(parseISO(monday), 1), "yyyy-MM-dd"))}
          disabled={loading || assigning}
          className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium flex-1 text-center">
          Semaine du {format(parseISO(monday), "d MMM yyyy", { locale: fr })}
        </span>
        <button
          type="button"
          onClick={() => loadWeek(format(addWeeks(parseISO(monday), 1), "yyyy-MM-dd"))}
          disabled={loading || assigning}
          className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {travelLoading && !loading && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="size-3 animate-spin" /> Calcul des temps de trajet…
        </p>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="size-4 animate-spin" /> Chargement du calendrier…
        </div>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {!loading && teams.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune équipe active.</p>
      )}

      {!loading && teams.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground border-b border-r">Équipe</th>
                {weekDates.map((d, i) => (
                  <th key={d} className="px-1 py-1.5 text-center font-medium text-muted-foreground border-b border-r last:border-r-0">
                    <div>{DAY_NAMES[i]}</div>
                    <div className="text-foreground">{format(parseISO(d), "d MMM", { locale: fr })}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.id} className="border-b last:border-b-0">
                  <td className="px-2 py-1 font-medium border-r align-top whitespace-nowrap">{team.name}</td>
                  {weekDates.map((dateStr) => {
                    const state = getDayState(stateMap, team.id, dateStr);
                    const amFree = canAssignToHalf(state, "am", true);
                    const pmFree = canAssignToHalf(state, "pm", true);
                    const fullFree = canAssignFullDay(state, true);
                    const canAm = needsFullDay ? fullFree : amFree;
                    const canPm = needsFullDay ? false : pmFree;
                    const amTravel = needsFullDay
                      ? travelFor(team.id, dateStr, "full_day")
                      : travelFor(team.id, dateStr, "am");
                    const pmTravel = travelFor(team.id, dateStr, "pm");
                    return (
                      <td key={dateStr} className="p-0.5 border-r last:border-r-0 align-top">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={assigning || !canAm}
                            onClick={() => canAm && onPick(team.id, dateStr, "am")}
                            className={cn(
                              "rounded px-1.5 py-1 text-left disabled:opacity-40",
                              canAm ? "hover:bg-accent" : "bg-muted/40 cursor-not-allowed"
                            )}
                          >
                            <span className="block">
                              {needsFullDay
                                ? (fullFree ? "Journée libre" : "Occupé")
                                : (amFree ? "AM libre" : "AM occupé")}
                            </span>
                            {canAm && (
                              <TravelDuration
                                seconds={amTravel}
                                className="text-[11px] font-semibold"
                                numberClassName="font-semibold"
                                neutral={needsFullDay}
                              />
                            )}
                          </button>
                          {!needsFullDay && (
                            <button
                              type="button"
                              disabled={assigning || !canPm}
                              onClick={() => canPm && onPick(team.id, dateStr, "pm")}
                              className={cn(
                                "rounded px-1.5 py-1 text-left disabled:opacity-40",
                                canPm ? "hover:bg-accent" : "bg-muted/40 cursor-not-allowed"
                              )}
                            >
                              <span className="block">{pmFree ? "PM libre" : "PM occupé"}</span>
                              {canPm && (
                                <TravelDuration
                                  seconds={pmTravel}
                                  className="text-[11px] font-semibold"
                                  numberClassName="font-semibold"
                                />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
