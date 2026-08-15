"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarOff, ChevronLeft, ChevronRight, Loader2, MapPin, Plus, Sparkles, X } from "lucide-react";

import {
  findBestSlotsForProspect,
  getProspectsForSlot,
  computeProspectDistances,
  bookProspectToSlot,
  type ProspectForSlot,
  type ProspectSlotResult,
} from "@/actions/sales";
import { createProspect } from "@/actions/prospects";
import { DualAddressBlock, emptyDualAddress, type DualAddressState } from "@/features/sales/pipeline-client";
import { createSalespersonBlock } from "@/actions/blocks";
import { TravelDuration } from "@/lib/format-travel";
import { FIXED_TIME_SLOTS } from "./sales-utils";
import type { SalespersonForCalendar } from "./sales-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type SlotInfo = {
  salesperson_id: string;
  salesperson_name: string;
  date: string;
  start_time: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  slot: SlotInfo;
  salespeople: SalespersonForCalendar[];
};

type Tab = "prospects" | "new-client" | "block";

const BLOCK_TYPES = [
  { value: "vacances", label: "Vacances" },
  { value: "bureau",   label: "Bureau / Formation" },
  { value: "autre",    label: "Autre" },
] as const;

// ── Onglet Prospects ──────────────────────────────────────────────────────────

function ProspectsTab({
  slot,
  onBooked,
}: {
  slot: SlotInfo;
  onBooked: (msg: string) => void;
}) {
  const [prospects, setProspects] = useState<ProspectForSlot[] | null>(null);
  const [prevLabel, setPrevLabel] = useState("");
  const [loadingDist, setLoadingDist] = useState(false);
  const [loading, startLoad] = useTransition();
  const [booking, startBook] = useTransition();
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Étape 1 : liste immédiate depuis la DB (< 1 sec)
    startLoad(async () => {
      const res = await getProspectsForSlot(slot.salesperson_id, slot.date, slot.start_time);
      if (!res.ok) { setError(res.message); return; }
      setProspects(res.prospects);
      setPrevLabel(res.prevLabel);

      // Étape 2 : distances en arrière-plan (sans bloquer l'affichage)
      if (res.prospects.length > 0 && res.originLat && res.originLng) {
        setLoadingDist(true);
        const dests = res.prospects.map((p) => ({ lat: p.client_lat, lng: p.client_lng }));
        computeProspectDistances(res.originLat, res.originLng, dests)
          .then((distances) => {
            setProspects((prev) => {
              if (!prev) return prev;
              const updated = prev.map((p, i) => ({
                ...p,
                distance_meters: distances[i]?.meters ?? null,
                travel_seconds: distances[i]?.seconds ?? null,
              }));
              updated.sort((a, b) => {
                if (a.travel_seconds === null && b.travel_seconds === null) return 0;
                if (a.travel_seconds === null) return 1;
                if (b.travel_seconds === null) return -1;
                return a.travel_seconds - b.travel_seconds;
              });
              return updated;
            });
          })
          .finally(() => setLoadingDist(false));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.salesperson_id, slot.date, slot.start_time]);

  const book = (p: ProspectForSlot) => {
    setBookingId(p.job_id);
    startBook(async () => {
      const res = await bookProspectToSlot({
        jobId: p.job_id,
        salespersonId: slot.salesperson_id,
        scheduledDate: slot.date,
        startTime: slot.start_time,
      });
      setBookingId(null);
      if (!res.ok) { setError(res.message); return; }
      const day = format(new Date(slot.date + "T12:00:00"), "EEEE d MMM", { locale: fr });
      onBooked(`RDV confirmé — ${p.client_name} · ${day} à ${slot.start_time}`);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Calcul des distances depuis {slot.salesperson_name}…
      </div>
    );
  }

  if (error) return <p className="text-destructive text-sm py-4">{error}</p>;

  if (!prospects?.length) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Aucun prospect avec adresse GPS dans le pipeline.
        <br />Utilisez l&apos;onglet <strong>Nouveau client</strong> pour créer un RDV.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">
          Depuis : <strong>{prevLabel || "—"}</strong>
        </p>
        {loadingDist
          ? <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="size-3 animate-spin" />Classement en cours…</span>
          : <span className="text-[10px] text-muted-foreground">Trié par temps de trajet</span>
        }
      </div>
      {prospects.map((p, i) => {
        const isBooking = booking && bookingId === p.job_id;
        const rankKnown = p.travel_seconds !== null;
        return (
          <button
            key={p.job_id}
            onClick={() => book(p)}
            disabled={booking}
            className="w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-accent transition-colors disabled:opacity-60"
          >
            <span className={`shrink-0 size-5 rounded-full text-[11px] font-bold flex items-center justify-center ${rankKnown ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {loadingDist ? "·" : i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{p.client_name}</div>
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                {p.client_city && <><MapPin className="size-2.5" />{p.client_city}</>}
                {p.client_phone && <span className="ml-1">{p.client_phone}</span>}
              </div>
            </div>
            <div className="shrink-0 text-right min-w-[52px]">
              <div className="text-xs font-semibold">
                <TravelDuration seconds={p.travel_seconds} numberClassName="font-semibold" />
              </div>
              <div className="text-[10px] text-muted-foreground">de trajet</div>
            </div>
            {isBooking
              ? <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
              : <span className="shrink-0 text-xs text-muted-foreground">→</span>
            }
          </button>
        );
      })}
    </div>
  );
}

// ── Onglet Nouveau client ─────────────────────────────────────────────────────

type NewClientStep = "form" | "loading" | "slots";

function NewClientTab({
  slot,
  onCreated,
}: {
  slot: SlotInfo;
  salespeople: SalespersonForCalendar[];
  onCreated: (appointmentId: string) => void;
}) {
  const [step, setStep] = useState<NewClientStep>("form");
  const [form, setForm] = useState({
    client_name: "",
    client_phone: "",
    client_email: "",
    ...emptyDualAddress(),
    installation_info: "",
  });
  const [slots, setSlots] = useState<ProspectSlotResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [booking, startBook] = useTransition();
  const [bookingKey, setBookingKey] = useState<string | null>(null);

  const setAddr = useCallback((patch: Partial<DualAddressState>) => setForm((f) => ({ ...f, ...patch })), []);

  const addrState: DualAddressState = {
    billing_address: form.billing_address, billing_city: form.billing_city, billing_postal: form.billing_postal,
    same_address: form.same_address,
    install_address: form.install_address, install_city: form.install_city, install_postal: form.install_postal,
    install_lat: form.install_lat, install_lng: form.install_lng,
  };

  const findSlots = async () => {
    if (!form.install_lat || !form.install_lng) return;
    setError(null);
    setStep("loading");
    const res = await findBestSlotsForProspect(form.install_lat, form.install_lng);
    if (!res.ok) { setError(res.message); setStep("form"); return; }
    setSlots(res.slots);
    setStep("slots");
  };

  const bookSlot = (s: ProspectSlotResult) => {
    if (!form.client_name.trim()) { setError("Le nom du client est requis."); return; }
    const key = `${s.date}|${s.start_time}`;
    setBookingKey(key);
    setError(null);
    startBook(async () => {
      // 1. Créer le prospect (client + job dans le pipeline)
      const prospectRes = await createProspect({
        name: form.client_name,
        phone: form.client_phone || null,
        email: form.client_email || null,
        billing_address: (form.same_address ? form.install_address : form.billing_address) || null,
        billing_city: (form.same_address ? form.install_city : form.billing_city) || null,
        billing_postal: (form.same_address ? form.install_postal : form.billing_postal) || null,
        install_address: form.install_address || null,
        install_city: form.install_city || null,
        install_postal: form.install_postal || null,
        install_lat: form.install_lat,
        install_lng: form.install_lng,
        installation_info: form.installation_info || null,
        salesperson_id: s.salesperson_id || slot.salesperson_id || null,
        // Placement calendrier (appel) → pas d'ownership, suggestions futures = tous vendeurs
        salesperson_locked: false,
      });
      if (!prospectRes.ok) { setError(prospectRes.message); setBookingKey(null); return; }

      // 2. Réserver le créneau
      const bookRes = await bookProspectToSlot({
        jobId: prospectRes.jobId,
        salespersonId: s.salesperson_id,
        scheduledDate: s.date,
        startTime: s.start_time,
      });
      setBookingKey(null);
      if (!bookRes.ok) { setError(bookRes.message); return; }
      onCreated(bookRes.appointmentId);
    });
  };

  const inp = "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const lbl = "block text-sm font-medium mb-1";
  const canOptimize = !!form.install_lat && !!form.client_name.trim();

  // ── Étape 1 : formulaire ──────────────────────────────────────────────────
  if (step === "form") {
    return (
      <div className="space-y-3">
        <div>
          <label className={lbl}>Nom <span className="text-destructive">*</span></label>
          <input
            className={inp}
            value={form.client_name}
            onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
            placeholder="Marie Tremblay"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Téléphone</label>
            <input
              type="tel"
              className={inp}
              value={form.client_phone}
              onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))}
              placeholder="819-555-1234"
            />
          </div>
          <div>
            <label className={lbl}>Courriel</label>
            <input
              type="email"
              className={inp}
              value={form.client_email}
              onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))}
              placeholder="marie@exemple.com"
            />
          </div>
        </div>
        <DualAddressBlock state={addrState} onChange={setAddr} inp={inp} lbl={lbl} />
        <div>
          <label className={lbl}>Notes / Info projet</label>
          <textarea
            className={`${inp} h-16 py-2 resize-none`}
            value={form.installation_info}
            onChange={(e) => setForm((f) => ({ ...f, installation_info: e.target.value }))}
            placeholder="Détails sur l'installation, besoins spéciaux…"
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <button
          type="button"
          onClick={findSlots}
          disabled={!canOptimize}
          className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <Sparkles className="size-4" />
          Trouver le meilleur créneau
        </button>
        {!form.install_lat && (
          <p className="text-[11px] text-muted-foreground text-center">
            Sélectionnez l&apos;adresse d&apos;installation dans Google pour activer l&apos;optimisation.
          </p>
        )}
      </div>
    );
  }

  // ── Étape 2 : chargement ──────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Recherche des meilleurs créneaux…
      </div>
    );
  }

  // ── Étape 3 : liste des créneaux ──────────────────────────────────────────
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium truncate">{form.client_name}</p>
        <button
          onClick={() => setStep("form")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0 ml-2"
        >
          <ChevronLeft className="size-3" />
          Modifier
        </button>
      </div>
      {slots.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Aucun créneau disponible dans les 30 prochains jours.
        </p>
      ) : (
        slots.map((s, i) => {
          const key = `${s.salesperson_id}-${s.date}-${s.start_time}`;
          const isBooking = booking && bookingKey === `${s.date}|${s.start_time}`;
          return (
            <button
              key={key}
              onClick={() => bookSlot(s)}
              disabled={booking}
              className="w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-accent transition-colors disabled:opacity-60"
            >
              <span className="shrink-0 size-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium capitalize">{s.dateFormatted} · {s.start_time}</div>
                <div className="text-xs text-muted-foreground truncate">{s.context}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-medium text-primary">{s.salesperson_name}</div>
                {s.travel_seconds !== null && (
                  <div className="text-[10px] text-muted-foreground">
                    <TravelDuration seconds={s.travel_seconds} />
                  </div>
                )}
              </div>
              {isBooking
                ? <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                : <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              }
            </button>
          );
        })
      )}
      {error && <p className="text-destructive text-sm mt-2">{error}</p>}
    </div>
  );
}

// ── Onglet Bloquer ────────────────────────────────────────────────────────────

function BlockTab({
  slot,
  onBlocked,
}: {
  slot: SlotInfo;
  onBlocked: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    block_type: "vacances" as "vacances" | "bureau" | "autre",
    start_date: slot.date,
    end_date: slot.date,
    full_day: true,
    start_time: slot.start_time,
    end_time: "",
    notes: "",
  });

  const weekMonday = format(startOfWeek(new Date(slot.date + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekFriday = format(addDays(new Date(weekMonday + "T12:00:00"), 4), "yyyy-MM-dd");
  const twoWeeksFriday = format(addDays(new Date(weekMonday + "T12:00:00"), 11), "yyyy-MM-dd");

  const presets = [
    { label: "Journée complète", start: slot.date, end: slot.date, fullDay: true },
    { label: "Cette semaine (lun-ven)", start: weekMonday, end: weekFriday, fullDay: true },
    { label: "2 semaines", start: weekMonday, end: twoWeeksFriday, fullDay: true },
  ];

  const applyPreset = (p: typeof presets[0]) => {
    setForm((f) => ({ ...f, start_date: p.start, end_date: p.end, full_day: p.fullDay }));
  };

  const handleSave = () => {
    setError(null);
    start(async () => {
      const { createSalespersonBlock } = await import("@/actions/blocks");
      const res = await createSalespersonBlock({
        salesperson_id: slot.salesperson_id,
        block_type: form.block_type,
        start_date: form.start_date,
        end_date: form.end_date,
        start_time: form.full_day ? null : (form.start_time || null),
        end_time: form.full_day ? null : (form.end_time || null),
        notes: form.notes || null,
      });
      if (!res.ok) { setError(res.message); return; }
      onBlocked();
    });
  };

  const inp = "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const lbl = "block text-sm font-medium mb-1";

  return (
    <div className="space-y-4">
      {/* Vendeur + type */}
      <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-800 font-medium">
        Blocage pour : {slot.salesperson_name}
      </div>

      {/* Préréglages rapides */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">Durée rapide</p>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Type de blocage */}
      <div>
        <label className={lbl}>Type</label>
        <div className="flex gap-3">
          {BLOCK_TYPES.map((bt) => (
            <label key={bt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="block_type"
                value={bt.value}
                checked={form.block_type === bt.value}
                onChange={() => setForm((f) => ({ ...f, block_type: bt.value }))}
              />
              {bt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Date début</label>
          <input type="date" className={inp} value={form.start_date}
            onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
        </div>
        <div>
          <label className={lbl}>Date fin</label>
          <input type="date" className={inp} value={form.end_date}
            onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
        </div>
      </div>

      {/* Journée complète vs plage horaire */}
      <div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.full_day}
            onChange={(e) => setForm((f) => ({ ...f, full_day: e.target.checked }))}
            className="rounded"
          />
          Journée complète
        </label>
        {!form.full_day && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className={lbl}>Heure début</label>
              <select className={inp} value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}>
                {FIXED_TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Heure fin (excl.)</label>
              <select className={inp} value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}>
                <option value="">— fin de journée —</option>
                {FIXED_TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className={lbl}>Note (optionnelle)</label>
        <input className={inp} value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="ex: Vacances été" />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="w-full h-10 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
      >
        {pending ? "Enregistrement…" : "Bloquer cette période"}
      </button>
    </div>
  );
}

// ── Modal principale ───────────────────────────────────────────────────────────

export function SlotActionModal({ open, onClose, slot, salespeople }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("prospects");
  const [toast, setToast] = useState<string | null>(null);

  if (!open) return null;

  const dayLabel = format(new Date(slot.date + "T12:00:00"), "EEEE d MMM", { locale: fr });

  const handleBooked = (msg: string) => {
    setToast(msg);
    onClose();
    router.refresh();
  };

  const handleNewClientCreated = (_id: string) => {
    setToast("Rendez-vous créé avec succès.");
    onClose();
    router.refresh();
  };

  const handleBlocked = () => {
    onClose();
    router.refresh();
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "prospects",   label: "Prospects",     icon: <Sparkles className="size-3.5" /> },
    { id: "new-client",  label: "Nouveau client", icon: <Plus className="size-3.5" /> },
    { id: "block",       label: "Bloquer",        icon: <CalendarOff className="size-3.5" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-semibold">{slot.salesperson_name}</h2>
            <p className="text-xs text-muted-foreground capitalize">{dayLabel} · {slot.start_time}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        {/* Onglets */}
        <div className="flex border-b px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div className="px-5 py-4">
          {tab === "prospects" && (
            <ProspectsTab slot={slot} onBooked={handleBooked} />
          )}
          {tab === "new-client" && (
            <NewClientTab slot={slot} salespeople={salespeople} onCreated={handleNewClientCreated} />
          )}
          {tab === "block" && (
            <BlockTab slot={slot} onBlocked={handleBlocked} />
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-3 rounded-xl border bg-background shadow-lg px-4 py-3 text-sm font-medium max-w-sm">
          <span className="text-emerald-600">✓</span>
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-muted-foreground"><X className="size-4" /></button>
        </div>
      )}
    </div>
  );
}
