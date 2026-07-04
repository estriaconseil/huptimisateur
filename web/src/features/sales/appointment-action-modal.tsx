"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, CalendarDays, ChevronRight, Loader2, Move, Phone, Sparkles, X } from "lucide-react";

import { moveAppointment, cancelAppointment, findBestSlotsForProspect, type ProspectSlotResult } from "@/actions/sales";
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
  completed:  "bg-green-100 text-green-800",
  no_show:    "bg-red-100 text-red-800",
};
const STATUS_LABELS: Record<string, string> = {
  scheduled: "Prévu",
  completed:  "Complété",
  no_show:    "Absent",
};

function fmtDist(m: number | null) {
  if (m === null) return null;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function AppointmentActionModal({ open, onClose, appointment, salespeople }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [moveTab, setMoveTab] = useState<"optimizer" | "manual">("optimizer");
  const [moving, startMove] = useTransition();
  const [cancelling, startCancel] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Optimiseur
  const [slots, setSlots] = useState<ProspectSlotResult[] | null>(null);
  const [loadingSlots, startLoadSlots] = useTransition();
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);

  const hasGps = !!(appointment.client_lat && appointment.client_lng);

  // Charger les créneaux optimisés dès l'ouverture du mode "move"
  useEffect(() => {
    if (mode === "move" && moveTab === "optimizer" && hasGps && slots === null) {
      startLoadSlots(async () => {
        const res = await findBestSlotsForProspect(appointment.client_lat!, appointment.client_lng!);
        if (res.ok) setSlots(res.slots);
      });
    }
  }, [mode, moveTab, hasGps, slots, appointment.client_lat, appointment.client_lng]);

  const [moveForm, setMoveForm] = useState({
    salesperson_id: appointment.salesperson_id,
    scheduled_date: appointment.scheduled_date,
    start_time: appointment.start_time,
  });

  if (!open) return null;

  const dayLabel = format(parseISO(appointment.scheduled_date), "EEEE d MMMM yyyy", { locale: fr });

  const handleMove = () => {
    setError(null);
    startMove(async () => {
      const res = await moveAppointment(
        appointment.id,
        moveForm.salesperson_id,
        moveForm.scheduled_date,
        moveForm.start_time
      );
      if (!res.ok) { setError(res.message); return; }
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
      if (!res.ok) { setError(res.message); return; }
      onClose();
      router.refresh();
    });
  };

  const handleCancel = () => {
    startCancel(async () => {
      const res = await cancelAppointment(appointment.id);
      if (!res.ok) { setError(res.message); return; }
      onClose();
      router.refresh();
    });
  };

  const inp = "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const lbl = "block text-sm font-medium mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md mx-4 p-5 space-y-4">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">{appointment.client_name}</h2>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[appointment.status] ?? "bg-muted"}`}>
                {STATUS_LABELS[appointment.status] ?? appointment.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 capitalize">
                <CalendarDays className="size-3" />
                {dayLabel} · {appointment.start_time}
              </span>
              {appointment.client_phone && (
                <span className="flex items-center gap-1">
                  <Phone className="size-3" />{appointment.client_phone}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="size-5" />
          </button>
        </div>

        {/* Mode VIEW */}
        {mode === "view" && (
          <div className="flex flex-col gap-2">
            {appointment.quote_id && (
              <a
                href={`/ventes/rdv/${appointment.id}`}
                className="flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                Voir / modifier la soumission
                <ArrowRight className="size-4 text-muted-foreground" />
              </a>
            )}
            {!appointment.quote_id && (
              <a
                href={`/ventes/rdv/${appointment.id}`}
                className="flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                Créer la soumission
                <ArrowRight className="size-4 text-muted-foreground" />
              </a>
            )}
            <button
              onClick={() => setMode("move")}
              className="flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
            >
              <span className="flex items-center gap-2"><Move className="size-4" />Déplacer le rendez-vous</span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </button>
            {appointment.status === "scheduled" && (
              <button
                onClick={() => setMode("cancel")}
                className="flex items-center justify-between rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
              >
                Annuler ce rendez-vous
                <X className="size-4" />
              </button>
            )}
          </div>
        )}

        {/* Mode DÉPLACER */}
        {mode === "move" && (
          <div className="space-y-3">
            {/* Sous-onglets */}
            <div className="flex rounded-lg border overflow-hidden text-xs">
              <button
                onClick={() => setMoveTab("optimizer")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${moveTab === "optimizer" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <Sparkles className="size-3" />Meilleur emplacement
              </button>
              <button
                onClick={() => setMoveTab("manual")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 font-medium border-l transition-colors ${moveTab === "manual" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                Choisir manuellement
              </button>
            </div>

            {/* Onglet Optimiseur */}
            {moveTab === "optimizer" && (
              <>
                {!hasGps && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    Pas de GPS pour ce client — utilisez &quot;Choisir manuellement&quot;.
                  </p>
                )}
                {hasGps && loadingSlots && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 justify-center">
                    <Loader2 className="size-4 animate-spin" />Recherche des meilleurs créneaux…
                  </div>
                )}
                {hasGps && !loadingSlots && slots !== null && slots.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-3">Aucun créneau disponible dans les 30 prochains jours.</p>
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
                          className="w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-accent transition-colors disabled:opacity-60"
                        >
                          <span className="shrink-0 size-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium capitalize">{s.dateFormatted} · {s.start_time}</div>
                            <div className="text-xs text-muted-foreground truncate">{s.context}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs font-medium text-primary">{s.salesperson_name}</div>
                            {s.detour_meters !== null && (
                              <div className="text-[10px] text-muted-foreground">détour {fmtDist(s.detour_meters)}</div>
                            )}
                          </div>
                          {isLoading ? <Loader2 className="size-4 animate-spin shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Onglet Manuel */}
            {moveTab === "manual" && (
              <>
                <div>
                  <label className={lbl}>Vendeur</label>
                  <select className={inp} value={moveForm.salesperson_id}
                    onChange={(e) => setMoveForm((f) => ({ ...f, salesperson_id: e.target.value }))}>
                    {salespeople.filter((s) => s.active).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Date</label>
                    <input type="date" className={inp} value={moveForm.scheduled_date}
                      onChange={(e) => setMoveForm((f) => ({ ...f, scheduled_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className={lbl}>Heure</label>
                    <select className={inp} value={moveForm.start_time}
                      onChange={(e) => setMoveForm((f) => ({ ...f, start_time: e.target.value }))}>
                      {FIXED_TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
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

        {/* Mode ANNULER */}
        {mode === "cancel" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              Confirmer l&apos;annulation du RDV avec <strong>{appointment.client_name}</strong> ?
              <br />Le rendez-vous sera marqué annulé dans le calendrier.
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 h-9 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {cancelling ? <Loader2 className="size-4 animate-spin" /> : null}
                {cancelling ? "Annulation…" : "Confirmer l'annulation"}
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
