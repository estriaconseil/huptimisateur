"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowRightLeft,
  CalendarDays,
  ChevronRight,
  FileText,
  Home,
  Loader2,
  Pencil,
  User,
  MapPin,
  Phone,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import {
  moveAppointment,
  cancelAppointment,
  findBestSlotsForProspect,
  getJobForEdit,
  updateJobQuick,
  type ProspectSlotResult,
  type JobQuickData,
} from "@/actions/sales";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cityFromAddress } from "@/lib/address";
import { TravelDuration } from "@/lib/format-travel";
import { cn } from "@/lib/utils";
import { WeekCalendar } from "@/features/sales/pipeline-client";
import { FIXED_TIME_SLOTS } from "./sales-utils";
import type { AppointmentRow, SalespersonForCalendar } from "./sales-utils";

type Props = {
  open: boolean;
  onClose: () => void;
  appointment: AppointmentRow;
  salespeople: SalespersonForCalendar[];
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  no_show: "bg-red-100 text-red-800",
};
const STATUS_LABELS: Record<string, string> = {
  scheduled: "Prévu",
  completed: "Complété",
  no_show: "Absent",
};

type MoveTab = "optimizer" | "calendar" | "manual";

export function AppointmentActionModal({ open, onClose, appointment, salespeople }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "move" | "cancel" | "edit">("view");
  const [moveTab, setMoveTab] = useState<MoveTab>("optimizer");
  const [moving, startMove] = useTransition();
  const [cancelling, startCancel] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [slots, setSlots] = useState<ProspectSlotResult[] | null>(null);
  const [loadingSlots, startLoadSlots] = useTransition();
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);

  // ── Mode édition de la fiche prospect ──────────────────────────────────
  const [jobData, setJobData] = useState<JobQuickData | null>(null);
  const [loadingJob, startLoadJob] = useTransition();
  const [saving, startSave] = useTransition();
  const [editForm, setEditForm] = useState<JobQuickData | null>(null);

  const hasGps = !!(appointment.client_lat && appointment.client_lng);
  const city = appointment.client_city ?? cityFromAddress(appointment.client_address);

  useEffect(() => {
    if (!open) {
      setMode("view");
      setSlots(null);
      setError(null);
      setMoveTab("optimizer");
      setJobData(null);
      setEditForm(null);
    }
  }, [open]);

  const openEdit = () => {
    if (!appointment.job_id) return;
    setError(null);
    setJobData(null);
    setEditForm(null);
    setMode("edit");
    startLoadJob(async () => {
      const res = await getJobForEdit(appointment.job_id!);
      if (res.ok) {
        setJobData(res.data);
        setEditForm(res.data);
      } else {
        setError(res.message);
      }
    });
  };

  const handleSaveEdit = () => {
    if (!editForm || !appointment.job_id) return;
    setError(null);
    startSave(async () => {
      const res = await updateJobQuick(appointment.job_id!, editForm);
      if (!res.ok) { setError(res.message); return; }
      setMode("view");
      router.refresh();
    });
  };

  useEffect(() => {
    if (mode === "move" && moveTab === "optimizer" && hasGps && slots === null) {
      startLoadSlots(async () => {
        const filterSp = appointment.salesperson_locked ? appointment.salesperson_id : null;
        const res = await findBestSlotsForProspect(
          appointment.client_lat!,
          appointment.client_lng!,
          10,
          filterSp,
          appointment.id,
          appointment.client_city ?? null,
        );
        if (res.ok) setSlots(res.slots);
      });
    }
  }, [mode, moveTab, hasGps, slots, appointment.client_lat, appointment.client_lng, appointment.salesperson_id, appointment.salesperson_locked, appointment.id]);

  const [moveForm, setMoveForm] = useState({
    salesperson_id: appointment.salesperson_id,
    scheduled_date: appointment.scheduled_date,
    start_time: appointment.start_time,
  });

  if (!open) return null;

  const dayLabel = format(parseISO(appointment.scheduled_date), "EEEE d MMMM yyyy", { locale: fr });
  const salespersonName =
    salespeople.find((s) => s.id === appointment.salesperson_id)?.name ?? "—";

  const openOptimize = () => {
    setSlots(null);
    setMoveTab(hasGps ? "optimizer" : "calendar");
    setMode("move");
  };

  const openMove = () => {
    setSlots(null);
    setMoveTab(hasGps ? "calendar" : "manual");
    setMode("move");
  };

  const handleMove = () => {
    setError(null);
    startMove(async () => {
      const res = await moveAppointment(
        appointment.id,
        moveForm.salesperson_id,
        moveForm.scheduled_date,
        moveForm.start_time
      );
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const handleMoveToSlot = (s: ProspectSlotResult) => {
    setBookingSlot(`${s.salesperson_id}|${s.date}|${s.start_time}`);
    setError(null);
    startMove(async () => {
      const res = await moveAppointment(appointment.id, s.salesperson_id, s.date, s.start_time);
      setBookingSlot(null);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const handleCancel = () => {
    startCancel(async () => {
      const res = await cancelAppointment(appointment.id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const inp =
    "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const lbl = "block text-sm font-medium mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          "bg-background rounded-xl shadow-xl w-full max-w-md mx-auto p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">{appointment.client_name}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[appointment.status] ?? "bg-muted"}`}
              >
                {STATUS_LABELS[appointment.status] ?? appointment.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 capitalize">
                <CalendarDays className="size-3" />
                {dayLabel} · {appointment.start_time}
              </span>
              <span>{salespersonName}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground shrink-0">
            <X className="size-5" />
          </button>
        </div>

        {mode === "view" && (
          <>
            <div className="space-y-3 text-sm">
              {(appointment.client_phone || city || appointment.client_address) && (
                <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1">
                  {appointment.client_phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="size-3.5 text-muted-foreground shrink-0" />
                      <a href={`tel:${appointment.client_phone}`} className="text-primary hover:underline flex-1">
                        {appointment.client_phone}
                      </a>
                      {appointment.job_id && (
                        <button
                          onClick={openEdit}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          title="Modifier la fiche prospect"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                    </p>
                  )}
                  {city && (
                    <p className="flex items-center gap-2">
                      <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{city}</span>
                    </p>
                  )}
                  {appointment.client_address && (
                    <p className="text-muted-foreground text-xs leading-snug pl-5">
                      {appointment.client_address}
                    </p>
                  )}
                </div>
              )}
              {appointment.notes && (
                <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 dark:bg-yellow-950/30">
                  <p className="text-xs font-medium text-yellow-700 uppercase tracking-wide mb-1">Notes</p>
                  <p className="whitespace-pre-wrap text-yellow-900 dark:text-yellow-200 text-sm">
                    {appointment.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t">

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        onClose();
                        router.push(`/ventes/rdv/${appointment.id}?from=ventes`);
                      }}
                    />
                  }
                >
                  <FileText className="size-4" />
                </TooltipTrigger>
                <TooltipContent>
                  {appointment.quote_id ? "Voir la soumission" : "Créer la soumission"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button type="button" variant="outline" size="icon" onClick={openOptimize} disabled={!hasGps} />
                  }
                >
                  <Sparkles className="size-4" />
                </TooltipTrigger>
                <TooltipContent>
                  {hasGps ? "Optimiser le trajet" : "GPS manquant — utilisez Déplacer"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={<Button type="button" variant="outline" size="icon" onClick={openMove} />}
                >
                  <ArrowRightLeft className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Déplacer vers un autre créneau</TooltipContent>
              </Tooltip>

              {appointment.status === "scheduled" && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setMode("cancel")}
                      />
                    }
                  >
                    <Trash2 className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>Retirer / annuler le RDV</TooltipContent>
                </Tooltip>
              )}
            </div>
          </>
        )}

        {mode === "edit" && (
          <div className="space-y-3">
            {loadingJob && (
              <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" />
                Chargement…
              </div>
            )}

            {!loadingJob && editForm && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Fiche prospect
                </p>

                {/* Nom et téléphone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Nom du client</label>
                    <input
                      className={inp}
                      value={editForm.client_name}
                      onChange={(e) => setEditForm((f) => f ? { ...f, client_name: e.target.value } : f)}
                    />
                  </div>
                  <div>
                    <label className={lbl}>Téléphone</label>
                    <input
                      className={inp}
                      type="tel"
                      value={editForm.client_phone ?? ""}
                      onChange={(e) => setEditForm((f) => f ? { ...f, client_phone: e.target.value || null } : f)}
                    />
                  </div>
                </div>

                {/* Notes internes */}
                <div>
                  <label className={lbl}>Notes internes</label>
                  <textarea
                    rows={3}
                    className="border-input bg-background w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    value={editForm.internal_notes ?? ""}
                    onChange={(e) => setEditForm((f) => f ? { ...f, internal_notes: e.target.value || null } : f)}
                    placeholder="Notes visibles par l'équipe…"
                  />
                </div>

                {/* Info installation */}
                <div>
                  <label className={lbl}>Info installation</label>
                  <textarea
                    rows={2}
                    className="border-input bg-background w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    value={editForm.installation_info ?? ""}
                    onChange={(e) => setEditForm((f) => f ? { ...f, installation_info: e.target.value || null } : f)}
                    placeholder="Accès, type d'équipement…"
                  />
                </div>

                {/* Date de relance + drapeau */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Date de relance</label>
                    <input
                      type="date"
                      className={inp}
                      value={editForm.follow_up_date ?? ""}
                      onChange={(e) => setEditForm((f) => f ? { ...f, follow_up_date: e.target.value || null } : f)}
                    />
                  </div>
                  <div>
                    <label className={lbl}>Drapeau</label>
                    <select
                      className={inp}
                      value={editForm.follow_up_flag ?? ""}
                      onChange={(e) =>
                        setEditForm((f) => f
                          ? { ...f, follow_up_flag: (e.target.value || null) as JobQuickData["follow_up_flag"] }
                          : f
                        )
                      }
                    >
                      <option value="">— Aucun —</option>
                      <option value="a_suivre">À suivre</option>
                      <option value="a_relancer">À relancer</option>
                      <option value="rdv_passe">RDV passé</option>
                    </select>
                  </div>
                </div>

                {error && <p className="text-destructive text-sm">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                    {saving ? "Sauvegarde…" : "Sauvegarder"}
                  </button>
                  <button
                    onClick={() => setMode("view")}
                    disabled={saving}
                    className="px-4 h-9 rounded-lg border text-sm font-medium hover:bg-muted"
                  >
                    Annuler
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {mode === "move" && (
          <div className="space-y-3">
            <div className="flex rounded-lg border overflow-hidden text-xs isolate">
              <button
                type="button"
                onClick={() => setMoveTab("optimizer")}
                disabled={!hasGps}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 font-medium transition-colors",
                  moveTab === "optimizer" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  !hasGps && "opacity-40 cursor-not-allowed"
                )}
              >
                <Sparkles className="size-3" />
                Meilleur créneau
              </button>
              <button
                type="button"
                onClick={() => setMoveTab("calendar")}
                disabled={!hasGps}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 font-medium transition-colors border-l",
                  moveTab === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  !hasGps && "opacity-40 cursor-not-allowed"
                )}
              >
                <CalendarDays className="size-3" />
                Par calendrier
              </button>
              <button
                type="button"
                onClick={() => setMoveTab("manual")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 font-medium transition-colors border-l",
                  moveTab === "manual" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                Manuel
              </button>
            </div>

            {moveTab === "optimizer" && (
              <>
                {!hasGps && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    Pas de GPS — utilisez Par calendrier (indisponible) ou Manuel.
                  </p>
                )}
                {hasGps && loadingSlots && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 justify-center">
                    <Loader2 className="size-4 animate-spin" />
                    Recherche des meilleurs créneaux…
                  </div>
                )}
                {hasGps && !loadingSlots && slots !== null && slots.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    Aucun créneau disponible dans les 30 prochains jours.
                  </p>
                )}
                {hasGps && slots && slots.length > 0 && (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {slots.map((s, i) => {
                      const key = `${s.salesperson_id}|${s.date}|${s.start_time}`;
                      const isLoading = moving && bookingSlot === key;
                      return (
                        <button
                          key={key}
                          onClick={() => handleMoveToSlot(s)}
                          disabled={moving}
                          className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors disabled:opacity-60 ${
                            s.anchoredToClient
                              ? "border-emerald-500 bg-emerald-50/70 hover:bg-emerald-50"
                              : "hover:bg-accent"
                          }`}
                        >
                          <span className="shrink-0 size-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium capitalize">
                              {s.dateFormatted} · {s.start_time}
                            </div>
                            {s.startsFromHome ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                                <Home className="size-3.5 shrink-0" />
                                <span className="truncate">{s.salesperson_name}</span>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                                  <User className="size-3.5 shrink-0" />
                                  <span className="truncate">{s.context}</span>
                                </div>
                                <div className="text-xs font-medium text-primary truncate">{s.salesperson_name}</div>
                              </>
                            )}
                          </div>
                          {s.travel_seconds !== null && (
                            <div className="shrink-0 text-right">
                              <TravelDuration seconds={s.travel_seconds} className="text-sm font-semibold" numberClassName="text-sm font-semibold" />
                            </div>
                          )}
                          {isLoading ? (
                            <Loader2 className="size-4 animate-spin shrink-0" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {moveTab === "calendar" && hasGps && (
              <Dialog open onOpenChange={(o) => { if (!o) setMoveTab("optimizer"); }}>
                <DialogContent className="flex h-[94vh] w-[min(1200px,calc(100%-1rem))] max-w-none flex-col gap-3 overflow-hidden p-4 sm:max-w-none">
                  <DialogHeader className="shrink-0 pr-8">
                    <DialogTitle>Par calendrier</DialogTitle>
                  </DialogHeader>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <WeekCalendar
                      prospectLat={appointment.client_lat!}
                      prospectLng={appointment.client_lng!}
                      salespersonId={null}
                      excludeAppointmentId={appointment.id}
                      onSelectSlot={async (pick) => {
                        const res = await moveAppointment(
                          appointment.id,
                          pick.salespersonId,
                          pick.date,
                          pick.startTime
                        );
                        if (!res.ok) throw new Error(res.message);
                        onClose();
                        router.refresh();
                      }}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {moveTab === "manual" && (
              <>
                <div>
                  <label className={lbl}>Vendeur</label>
                  <select
                    className={inp}
                    value={moveForm.salesperson_id}
                    onChange={(e) => setMoveForm((f) => ({ ...f, salesperson_id: e.target.value }))}
                  >
                    {salespeople
                      .filter((s) => s.active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Date</label>
                    <input
                      type="date"
                      className={inp}
                      value={moveForm.scheduled_date}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setMoveForm((f) => ({ ...f, scheduled_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={lbl}>Heure</label>
                    <select
                      className={inp}
                      value={moveForm.start_time}
                      onChange={(e) => setMoveForm((f) => ({ ...f, start_time: e.target.value }))}
                    >
                      {FIXED_TIME_SLOTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleMove}
                  disabled={moving}
                  className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {moving ? <Loader2 className="size-4 animate-spin" /> : null}
                  {moving ? "Déplacement…" : "Confirmer le déplacement"}
                </button>
              </>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}

            <button
              onClick={() => setMode("view")}
              disabled={moving}
              className="w-full h-9 rounded-lg border text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              ← Retour
            </button>
          </div>
        )}

        {mode === "cancel" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              Retirer le RDV avec <strong>{appointment.client_name}</strong> ?
              <br />
              Le créneau sera libéré et le dossier repassera en Prospect.
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 h-9 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {cancelling ? <Loader2 className="size-4 animate-spin" /> : null}
                {cancelling ? "Retrait…" : "Oui, retirer"}
              </button>
              <button
                onClick={() => setMode("view")}
                disabled={cancelling}
                className="px-4 h-9 rounded-lg border text-sm font-medium hover:bg-muted"
              >
                Retour
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
