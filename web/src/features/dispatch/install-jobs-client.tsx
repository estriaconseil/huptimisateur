"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addDays, addWeeks, format, parseISO, startOfWeek, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  PlusCircle,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { statusLabel, statusColor } from "@/lib/job-status";
import { cityFromAddress } from "@/lib/address";
import { TravelDuration } from "@/lib/format-travel";
import { cn } from "@/lib/utils";
import { withQuoteOrigin } from "@/lib/quote-back";
import { getDistanceSuggestionsForJob } from "@/actions/suggestions";
import { assignJobToSlot } from "@/actions/schedules";
import { getInstallWeekGrid } from "@/actions/dispatch-week";
import { updateClient, updateJob } from "@/actions/clients";
import { JobTimeline } from "@/features/jobs/job-timeline";
import { AddressAutocomplete, type ResolvedPlace } from "@/components/maps/address-autocomplete";
import type { InstallJob } from "@/app/(app)/a-planifier/page";
import type { ScheduleSuggestion, EstimatedDurationHours } from "@/types/domain";
import {
  buildDispatchStateMap,
  canAssignFullDay,
  canAssignToHalf,
  getDayState,
  type EnrichedScheduleRow,
} from "@/services/planning/dispatch-state";
import type { TeamWithTechs } from "@/features/dispatch/load-dispatch-data";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the ISO Monday of the earliest week that still has future business days.
 * If the current week is entirely in the past (e.g. it's Sunday), returns next Monday.
 */
function nextAvailableWeekMonday(): string {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  const thisFriday = addDays(thisMonday, 4);
  const thisFridayIso = format(thisFriday, "yyyy-MM-dd");
  if (thisFridayIso >= todayIso) {
    return format(thisMonday, "yyyy-MM-dd");
  }
  // Current week is fully past — use next Monday
  return format(addDays(thisMonday, 7), "yyyy-MM-dd");
}

const STATUS_TABS = [
  { key: "all", label: "Tous" },
  { key: "a_planifier", label: "À planifier" },
  { key: "reparti", label: "Répartis" },
  { key: "retour_a_faire", label: "Retour à faire" },
] as const;
type TabKey = (typeof STATUS_TABS)[number]["key"];

function slotLabel(s: string) {
  if (s === "am") return "Avant-midi";
  if (s === "pm") return "Après-midi";
  return "Journée complète";
}

const inp =
  "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const lbl = "block text-sm font-medium mb-1";

// ─────────────────────────────────────────────────────────────────────────────
// Optimizer dialog
// ─────────────────────────────────────────────────────────────────────────────

function OptimizerDialog({
  job,
  fullDayThreshold,
  onClose,
  onAssigned,
}: {
  job: InstallJob;
  fullDayThreshold: number;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [mode, setMode] = useState<"list" | "calendar">("list");
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [extendedSearch, setExtendedSearch] = useState(false);
  const [assigning, startAssign] = useTransition();
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setExtendedSearch(false);
    const startWeek = nextAvailableWeekMonday();

    async function fetchSuggestions() {
      const res4 = await getDistanceSuggestionsForJob(job.id, startWeek, undefined, null, 4);
      if (cancelled) return;

      if (!res4.ok) {
        setWarning(res4.message);
        setLoading(false);
        return;
      }

      if (res4.warning) {
        setSuggestions(res4.suggestions);
        setWarning(res4.warning);
        setLoading(false);
        return;
      }

      if (res4.suggestions.length > 0) {
        setSuggestions(res4.suggestions);
        setLoading(false);
        return;
      }

      setExtendedSearch(true);
      const res8 = await getDistanceSuggestionsForJob(job.id, startWeek, undefined, null, 8);
      if (cancelled) return;

      if (res8.ok) {
        setSuggestions(res8.suggestions);
        setWarning(res8.suggestions.length === 0
          ? "Aucune plage disponible dans les 8 prochaines semaines. Vérifiez les équipes actives."
          : null
        );
      } else {
        setWarning(res8.message);
      }
      setLoading(false);
    }

    fetchSuggestions();
    return () => { cancelled = true; };
  }, [job.id]);

  function pickSlot(teamId: string, date: string, half: "am" | "pm") {
    setAssignError(null);
    startAssign(async () => {
      const res = await assignJobToSlot({
        jobId: job.id,
        teamId,
        scheduledDate: date,
        half,
        estimatedDurationHours: job.estimated_duration_hours as EstimatedDurationHours,
        fullDayThresholdHours: fullDayThreshold,
      });
      if (!res.ok) {
        setAssignError(res.message);
        return;
      }
      onAssigned();
    });
  }

  function pickSuggestion(s: ScheduleSuggestion) {
    const half: "am" | "pm" = s.slot === "pm" ? "pm" : "am";
    pickSlot(s.teamId, s.date, half);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b flex items-start justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-base font-semibold">Placer dans le calendrier</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {job.clients?.name ?? "Client"} · {job.estimated_duration_hours} h
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="size-5" />
          </button>
        </div>

        <div className="px-5 pt-3 shrink-0">
          <div className="flex rounded-lg border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setMode("list")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
                mode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <Sparkles className="size-3" />
              Meilleur créneau
            </button>
            <button
              type="button"
              onClick={() => setMode("calendar")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 font-medium transition-colors border-l ${
                mode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <CalendarDays className="size-3" />
              Par calendrier
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {assignError && (
            <p className="text-destructive text-sm rounded-md bg-destructive/10 px-3 py-2">{assignError}</p>
          )}

          {mode === "list" && (
            <>
              {loading && (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {extendedSearch
                      ? "Aucun créneau sur 4 semaines — recherche jusqu'à 8 semaines…"
                      : "Calcul des distances en cours…"}
                  </span>
                </div>
              )}
              {!loading && warning && (
                <p className="text-sm rounded-md bg-destructive/10 text-destructive px-3 py-2">{warning}</p>
              )}
              {!loading && extendedSearch && suggestions.length > 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-1.5 border border-amber-200">
                  Les 4 prochaines semaines sont complètes — résultats sur les semaines 5 à 8.
                </p>
              )}
              {suggestions.slice(0, 15).map((s, idx) => (
                <button
                  key={`${s.teamId}-${s.date}-${s.slot}-${idx}`}
                  type="button"
                  disabled={assigning}
                  onClick={() => pickSuggestion(s)}
                  className="border-border hover:bg-accent w-full rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold capitalize">
                      {format(parseISO(s.date), "EEEE d MMMM", { locale: fr })}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {slotLabel(s.slot)}
                      </span>
                    </span>
                    <TravelDuration
                      seconds={s.durationSeconds}
                      numberClassName="font-semibold"
                      neutral={s.slot === "full_day"}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-muted-foreground">{s.teamName}</span>
                    {assigning && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                  </div>
                </button>
              ))}
            </>
          )}

          {mode === "calendar" && (
            <InstallWeekPicker
              job={job}
              assigning={assigning}
              onPick={pickSlot}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function InstallWeekPicker({
  job,
  assigning,
  onPick,
}: {
  job: InstallJob;
  assigning: boolean;
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
    void getInstallWeekGrid(weekIso).then((res) => {
      setWeekDates(res.weekDates);
      setTeams(res.teams);
      setSchedules(res.schedules);
      setLoading(false);
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Impossible de charger le calendrier.");
      setLoading(false);
    });
    void getDistanceSuggestionsForJob(job.id, weekIso, undefined, null, 1).then((res) => {
      const next = new Map<string, number | null>();
      if (res.ok) {
        for (const s of res.suggestions) {
          next.set(`${s.teamId}|${s.date}|${s.slot}`, s.durationSeconds);
        }
      }
      setTravelByKey(next);
      setTravelLoading(false);
    }).catch(() => {
      setTravelLoading(false);
    });
  }

  useEffect(() => {
    loadWeek(monday);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stateMap = useMemo(() => buildDispatchStateMap(schedules), [schedules]);
  const needsFullDay = job.estimated_duration_hours === 8;
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

// ─────────────────────────────────────────────────────────────────────────────
// Client + Job edit modal
// ─────────────────────────────────────────────────────────────────────────────

function EditModal({
  job,
  onClose,
  onSaved,
}: {
  job: InstallJob;
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = job.clients;
  const [clientForm, setClientForm] = useState({
    name: c?.name ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    address_formatted: c?.address_formatted ?? "",
    city: c?.city ?? "",
    postal_code: c?.postal_code ?? "",
    lat: c?.lat ?? null as number | null,
    lng: c?.lng ?? null as number | null,
  });
  const [jobForm, setJobForm] = useState({
    installation_info: job.installation_info ?? "",
    internal_notes: job.internal_notes ?? "",
    preferred_date: job.preferred_date ?? "",
    estimated_duration_hours: job.estimated_duration_hours,
  });
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startSave(async () => {
      // Update client
      const cRes = await updateClient(job.client_id, {
        name: clientForm.name,
        email: clientForm.email ?? "",
        phone: clientForm.phone || undefined,
        address_formatted: clientForm.address_formatted || undefined,
        city: clientForm.city || undefined,
        postal_code: clientForm.postal_code || undefined,
        lat: clientForm.lat,
        lng: clientForm.lng,
      });
      if (!cRes.ok) { setError(cRes.message); return; }

      // Update job
      const jRes = await updateJob(job.id, {
        status: job.status,
        estimated_duration_hours: jobForm.estimated_duration_hours as EstimatedDurationHours,
        preferred_date: jobForm.preferred_date || "",
        installation_info: jobForm.installation_info || undefined,
        internal_notes: jobForm.internal_notes || undefined,
      });
      if (!jRes.ok) { setError(jRes.message); return; }

      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold">Modifier le dossier</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Section Client */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Informations client
            </p>

            <div>
              <label className={lbl}>Nom *</label>
              <input
                className={inp}
                value={clientForm.name}
                onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nom du client"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Téléphone</label>
                <input
                  className={inp}
                  value={clientForm.phone}
                  onChange={(e) => setClientForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="514-555-0000"
                />
              </div>
              <div>
                <label className={lbl}>Courriel</label>
                <input
                  type="email"
                  className={inp}
                  value={clientForm.email}
                  onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="client@email.com"
                />
              </div>
            </div>

            <div>
              <label className={lbl}>Adresse (Google Maps)</label>
              <AddressAutocomplete
                value={clientForm.address_formatted}
                onChange={(val) => setClientForm((f) => ({ ...f, address_formatted: val }))}
                onResolved={(place: ResolvedPlace) =>
                  setClientForm((f) => ({
                    ...f,
                    address_formatted: place.address_formatted,
                    city: place.city || f.city,
                    postal_code: place.postal_code || f.postal_code,
                    lat: place.lat,
                    lng: place.lng,
                  }))
                }
              />
              {clientForm.lat && (
                <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                  <MapPin className="size-3" />
                  GPS : {clientForm.lat.toFixed(5)}, {clientForm.lng?.toFixed(5)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Ville</label>
                <input
                  className={inp}
                  value={clientForm.city}
                  onChange={(e) => setClientForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Montréal"
                />
              </div>
              <div>
                <label className={lbl}>Code postal</label>
                <input
                  className={inp}
                  value={clientForm.postal_code}
                  onChange={(e) => setClientForm((f) => ({ ...f, postal_code: e.target.value }))}
                  placeholder="H1A 1A1"
                />
              </div>
            </div>
          </div>

          {/* Section Job */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Informations installation
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Durée estimée</label>
                <select
                  className={inp}
                  value={jobForm.estimated_duration_hours}
                  onChange={(e) =>
                    setJobForm((f) => ({
                      ...f,
                      estimated_duration_hours: Number(e.target.value) as EstimatedDurationHours,
                    }))
                  }
                >
                  <option value={4}>Demi-journée (4 h)</option>
                  <option value={8}>Journée complète (8 h)</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Date souhaitée</label>
                <input
                  type="date"
                  className={inp}
                  value={jobForm.preferred_date}
                  onChange={(e) => setJobForm((f) => ({ ...f, preferred_date: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className={lbl}>Notes d&apos;installation</label>
              <textarea
                className={`${inp} h-20 py-2 resize-none`}
                value={jobForm.installation_info}
                onChange={(e) => setJobForm((f) => ({ ...f, installation_info: e.target.value }))}
                placeholder="Détails sur l'installation, accès, équipements…"
              />
            </div>

            <div>
              <label className={lbl}>Notes internes</label>
              <textarea
                className={`${inp} h-16 py-2 resize-none`}
                value={jobForm.internal_notes}
                onChange={(e) => setJobForm((f) => ({ ...f, internal_notes: e.target.value }))}
                placeholder="Notes visibles par l'équipe seulement"
              />
            </div>
          </div>

          {error && (
            <p className="text-destructive text-sm rounded-md bg-destructive/10 px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={saving || !clientForm.name}
            onClick={handleSave}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function InstallJobsClient({
  jobs,
  weekIso,
  highlightJobId,
  scrollJobId,
  fetchError,
  fullDayThreshold,
}: {
  jobs: InstallJob[];
  weekIso: string;
  highlightJobId: string | null;
  scrollJobId: string | null;
  fetchError: string | null;
  fullDayThreshold: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [optimizerJob, setOptimizerJob] = useState<InstallJob | null>(null);
  const [editJob, setEditJob] = useState<InstallJob | null>(null);
  const [timelineJobId, setTimelineJobId] = useState<string | null>(null);
  const [deepLinkToast, setDeepLinkToast] = useState<string | null>(null);
  const highlightRef = useRef<HTMLLIElement | null>(null);
  const deepLinkOpenedFor = useRef<string | null>(null);

  useEffect(() => {
    if (scrollJobId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [scrollJobId]);

  // Deep-link ?highlight= (après Répartir) → ouvrir « Placer dans le calendrier »
  // ?job= (fiche client « Ouvrir ») → scroller seulement, sans ouvrir la modale
  useEffect(() => {
    if (!highlightJobId) {
      deepLinkOpenedFor.current = null;
      return;
    }
    if (deepLinkOpenedFor.current === highlightJobId) return;
    const found = jobs.find((j) => j.id === highlightJobId) ?? null;
    deepLinkOpenedFor.current = highlightJobId;
    if (found) {
      setOptimizerJob(found);
    } else {
      setDeepLinkToast("Cette job n'est plus sur le dashboard installation (statut changé).");
      router.replace("/a-planifier");
      const t = setTimeout(() => setDeepLinkToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [highlightJobId, jobs, router]);

  function clearDeepLinkEdit() {
    setEditJob(null);
    if (highlightJobId) {
      deepLinkOpenedFor.current = null;
      router.replace("/a-planifier");
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return jobs.filter((job) => {
      if (tab !== "all" && job.status !== tab) return false;
      if (!q) return true;
      const name = job.clients?.name?.toLowerCase() ?? "";
      const addr = job.clients?.address_formatted?.toLowerCase() ?? "";
      const city =
        (job.clients?.city ?? cityFromAddress(job.clients?.address_formatted))?.toLowerCase() ?? "";
      const info = job.installation_info?.toLowerCase() ?? "";
      const phone = job.clients?.phone?.toLowerCase() ?? "";
      return name.includes(q) || addr.includes(q) || city.includes(q) || info.includes(q) || phone.includes(q);
    });
  }, [jobs, tab, search]);

  const counts = useMemo(
    () => ({
      all: jobs.length,
      a_planifier: jobs.filter((j) => j.status === "a_planifier").length,
      reparti: jobs.filter((j) => j.status === "reparti").length,
      retour_a_faire: jobs.filter((j) => j.status === "retour_a_faire").length,
    }),
    [jobs]
  );

  return (
    <>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* ── En-tête ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pipeline installation</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/dispatch" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <CalendarDays className="size-3.5" />
              Calendrier dispatch
            </Link>
            <Link href="/nouveau" className={buttonVariants({ size: "sm" })}>
              <PlusCircle className="size-3.5" />
              Nouvelle job
            </Link>
          </div>
        </div>

        {/* ── Cartes de synthèse ── */}
        <div className="grid grid-cols-3 gap-3">
          {STATUS_TABS.slice(1).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(tab === t.key ? "all" : t.key)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors hover:bg-accent",
                tab === t.key && "ring-2 ring-ring bg-accent"
              )}
            >
              <p className="text-2xl font-bold tabular-nums">{counts[t.key]}</p>
              <p className="text-sm text-muted-foreground">{t.label}</p>
            </button>
          ))}
        </div>

        {/* ── Barre de recherche + tabs ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder="Rechercher client, ville, adresse, téléphone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="flex gap-1 rounded-lg border p-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm transition-colors",
                  tab === t.key
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                <span className="ml-1.5 text-[11px] opacity-70">
                  {t.key === "all" ? counts.all : counts[t.key]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {fetchError && (
          <p className="text-destructive text-sm" role="alert">
            {fetchError}
          </p>
        )}

        {/* ── Liste ── */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground text-sm">
                {search ? "Aucun résultat pour cette recherche." : "Aucune job dans cette catégorie."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {filtered.map((job) => {
              const isHighlighted = job.id === scrollJobId;
              const clientName = job.clients?.name ?? "Client sans nom";
              const city =
                job.clients?.city ?? cityFromAddress(job.clients?.address_formatted) ?? null;
              const pref = job.preferred_date
                ? format(parseISO(job.preferred_date), "d MMMM yyyy", { locale: fr })
                : null;
              const durationLabel =
                job.estimated_duration_hours === 8 ? "Journée (8 h)" : "Demi-journée (4 h)";

              return (
                <li key={job.id} ref={isHighlighted ? highlightRef : null}>
                  <Card
                    className={cn(
                      "transition-shadow hover:shadow-sm",
                      isHighlighted && "ring-2 ring-primary shadow-md"
                    )}
                  >
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      {/* ── Infos ── */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{clientName}</span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              statusColor(job.status)
                            )}
                          >
                            {statusLabel(job.status)}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {durationLabel}
                          </Badge>
                          {isHighlighted && (
                            <Badge className="text-[10px] bg-primary text-primary-foreground">
                              Nouveau
                            </Badge>
                          )}
                        </div>

                        {/* Créneau réparti */}
                        {job.schedule && (
                          <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                            <CalendarDays className="size-3" />
                            {format(
                              parseISO(job.schedule.scheduled_date),
                              "EEEE d MMMM yyyy",
                              { locale: fr }
                            )}
                            {job.schedule.team_name && (
                              <span className="text-muted-foreground">
                                · {job.schedule.team_name}
                              </span>
                            )}
                          </p>
                        )}

                        {pref && (
                          <p className="text-muted-foreground text-xs">
                            Date souhaitée : {pref}
                          </p>
                        )}

                        {job.clients?.phone && (
                          <p className="text-muted-foreground text-xs flex items-center gap-1">
                            <Phone className="size-3" />
                            <a href={`tel:${job.clients.phone}`} className="hover:underline">
                              {job.clients.phone}
                            </a>
                          </p>
                        )}

                        {(city || job.clients?.address_formatted) && (
                          <p className="text-muted-foreground text-xs flex items-start gap-1">
                            <MapPin className="size-3 mt-0.5 shrink-0" />
                            <span>
                              {city && <strong>{city}</strong>}
                              {city && job.clients?.address_formatted && " — "}
                              {job.clients?.address_formatted}
                            </span>
                          </p>
                        )}

                        {job.installation_info && (
                          <p className="text-muted-foreground line-clamp-2 text-xs">
                            {job.installation_info}
                          </p>
                        )}
                      </div>

                      {/* ── Actions ── */}
                      <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                        {/* Modifier le dossier */}
                        <button
                          type="button"
                          onClick={() => setEditJob(job)}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "gap-1.5 cursor-pointer"
                          )}
                        >
                          <Pencil className="size-3.5" />
                          Modifier
                        </button>
                        {/* Notes / Historique */}
                        <button
                          type="button"
                          onClick={() => setTimelineJobId((id) => id === job.id ? null : job.id)}
                          className={cn(
                            buttonVariants({ variant: timelineJobId === job.id ? "secondary" : "ghost", size: "sm" }),
                            "gap-1.5 cursor-pointer"
                          )}
                          title="Notes et historique"
                        >
                          <MessageSquare className="size-3.5" />
                          Notes
                        </button>

                        {/* Voir la soumission */}
                        <Link
                          href={withQuoteOrigin(`/ventes/soumission/${job.id}`, "a-planifier")}
                          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
                        >
                          <FileText className="size-3.5" />
                          Soumission
                        </Link>

                        {/* Placer dans le calendrier / voir au calendrier */}
                        {job.status !== "reparti" ? (
                          <button
                            type="button"
                            onClick={() => setOptimizerJob(job)}
                            className={cn(
                              buttonVariants({ size: "sm" }),
                              "gap-1.5 cursor-pointer"
                            )}
                          >
                            <MapPin className="size-3.5" />
                            Placer dans le calendrier
                            <ChevronRight className="size-3" />
                          </button>
                        ) : (
                          <Link
                            href={`/dispatch?week=${weekIso}`}
                            className={cn(
                              buttonVariants({ variant: "secondary", size: "sm" }),
                              "gap-1.5"
                            )}
                          >
                            <CalendarDays className="size-3.5" />
                            Voir au calendrier
                          </Link>
                        )}
                      </div>
                      {timelineJobId === job.id && (
                        <div className="border-t pt-3 mt-1 col-span-2">
                          <JobTimeline jobId={job.id} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Optimizer dialog ── */}
      {optimizerJob && (
        <OptimizerDialog
          job={optimizerJob}
          fullDayThreshold={fullDayThreshold}
          onClose={() => setOptimizerJob(null)}
          onAssigned={() => {
            setOptimizerJob(null);
            router.refresh();
          }}
        />
      )}

      {/* ── Edit modal ── */}
      {editJob && (
        <EditModal
          job={editJob}
          onClose={clearDeepLinkEdit}
          onSaved={() => {
            clearDeepLinkEdit();
            router.refresh();
          }}
        />
      )}

      {deepLinkToast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-background px-4 py-2 text-sm shadow-lg">
          {deepLinkToast}
        </div>
      )}
    </>
  );
}
