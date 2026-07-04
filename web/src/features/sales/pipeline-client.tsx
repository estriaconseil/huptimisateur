"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { addWeeks, format, parseISO, startOfWeek, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddressAutocomplete, type ResolvedPlace } from "@/components/maps/address-autocomplete";
import {
  bookProspectToSlot,
  findBestSlotsForProspect,
  getSlotsForWeekWithScores,
  type ProspectSlotResult,
  type SalespersonWeekData,
} from "@/actions/sales";
import { createProspect } from "@/actions/prospects";
import { updateClient, updateJob } from "@/actions/clients";
import { updateJobStatus } from "@/actions/jobs";
import { statusLabel, statusColor } from "@/lib/job-status";
import type { JobStatus, Salesperson } from "@/types/domain";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PipelineJob = {
  id: string;
  status: JobStatus;
  salesperson_id: string | null;
  installation_info: string | null;
  internal_notes: string | null;
  follow_up_date: string | null;
  created_at: string;
  clients: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    address_formatted: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  salespeople: { name: string } | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDist(m: number | null): string {
  if (m === null) return "—";
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

// ── Confirmation d'abandon réutilisable ───────────────────────────────────────

function AbandonConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/90 backdrop-blur-sm">
      <div className="mx-6 rounded-xl border bg-background shadow-lg p-5 space-y-3 max-w-xs w-full">
        <p className="text-sm font-semibold text-center">Abandonner la saisie?</p>
        <p className="text-xs text-muted-foreground text-center">Les informations saisies seront perdues.</p>
        <div className="flex gap-2 pt-1">
          <Button variant="destructive" onClick={onConfirm} className="flex-1 h-9 text-sm">
            Abandonner
          </Button>
          <Button variant="outline" onClick={onCancel} className="flex-1 h-9 text-sm">
            Continuer la saisie
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Création rapide d'un prospect ─────────────────────────────────────────────

type CreateStep = "form" | "loading-slots" | "slots";

function QuickProspectModal({
  onClose,
  salespeople,
  onBooked,
}: {
  onClose: () => void;
  salespeople: Salesperson[];
  onBooked?: (msg: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<CreateStep>("form");
  const [showAbandon, setShowAbandon] = useState(false);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);
  const [slots, setSlots] = useState<ProspectSlotResult[]>([]);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "",
    lat: null as number | null, lng: null as number | null,
    installation_info: "",
    salesperson_id: "",
  });

  const isDirty = !!(form.name || form.phone || form.email || form.address || form.installation_info);

  const tryClose = () => {
    if (step === "slots" || !isDirty) { onClose(); return; }
    setShowAbandon(true);
  };

  const onAddressResolved = useCallback((p: ResolvedPlace) => {
    setForm((f) => ({ ...f, address: p.address_formatted || p.address_raw, lat: p.lat, lng: p.lng }));
  }, []);

  /** Crée le prospect, retourne le jobId ou null en cas d'erreur */
  const doCreate = async (): Promise<string | null> => {
    if (!form.name.trim()) { setError("Le nom est requis."); return null; }
    setError(null);
    const res = await createProspect({
      ...form,
      installation_info: form.installation_info || null,
      salesperson_id: form.salesperson_id || null,
    });
    if (!res.ok) { setError(res.message); return null; }
    return res.jobId;
  };

  const handleCreateOnly = () => {
    start(async () => {
      const jobId = await doCreate();
      if (!jobId) return;
      router.refresh();
      onClose();
    });
  };

  const handleCreateAndOptimize = () => {
    if (!form.lat || !form.lng) {
      setError("Ajoutez une adresse géolocalisée pour lancer l'optimisation.");
      return;
    }
    start(async () => {
      const jobId = await doCreate();
      if (!jobId) return;
      setCreatedJobId(jobId);
      setStep("loading-slots");
      const res = await findBestSlotsForProspect(form.lat!, form.lng!);
      if (!res.ok) { setError(res.message); setStep("form"); return; }
      setSlots(res.slots);
      setStep("slots");
      router.refresh();
    });
  };

  const handleBooked = (msg: string) => {
    onClose();
    onBooked?.(msg);
  };

  const inp = "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const lbl = "block text-sm font-medium mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && tryClose()}
    >
      <div className={`relative bg-background rounded-xl shadow-xl w-full mx-4 max-h-[90vh] overflow-y-auto transition-[max-width] duration-200 ${step === "slots" ? "max-w-3xl" : "max-w-md"}`}>

        {showAbandon && (
          <AbandonConfirm onConfirm={onClose} onCancel={() => setShowAbandon(false)} />
        )}

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <div>
            {step === "form" && <h2 className="text-lg font-semibold">Nouveau prospect</h2>}
            {step === "loading-slots" && <h2 className="text-lg font-semibold">Recherche des créneaux…</h2>}
            {step === "slots" && (
              <>
                <h2 className="text-lg font-semibold">Choisir un créneau</h2>
                <p className="text-xs text-muted-foreground">{form.name}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "slots" && (
              <button
                onClick={() => setStep("form")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" />
                Retour
              </button>
            )}
            <button onClick={tryClose} className="text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* ── Étape 1 : formulaire ── */}
        {step === "form" && (
          <div className="px-6 pb-6 space-y-3">
            <div>
              <label className={lbl}>Nom complet <span className="text-destructive">*</span></label>
              <input className={inp} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Marie Tremblay" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Téléphone</label>
                <input type="tel" className={inp} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="819-555-1234" />
              </div>
              <div>
                <label className={lbl}>Courriel</label>
                <input type="email" className={inp} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="marie@example.com" />
              </div>
            </div>
            <div>
              <label className={lbl}>
                Adresse
                {form.lat
                  ? <span className="ml-1 text-[10px] text-emerald-600 font-normal">✓ géolocalisée</span>
                  : <span className="ml-1 text-[10px] text-amber-500 font-normal">requise pour l'optimisation</span>
                }
              </label>
              <AddressAutocomplete
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v, lat: null, lng: null }))}
                onResolved={onAddressResolved}
              />
            </div>
            {salespeople.length > 0 && (
              <div>
                <label className={lbl}>Vendeur assigné</label>
                <select className={inp} value={form.salesperson_id} onChange={(e) => setForm((f) => ({ ...f, salesperson_id: e.target.value }))}>
                  <option value="">— Aucun —</option>
                  {salespeople.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={lbl}>Notes / Info projet</label>
              <textarea
                className={`${inp} h-20 py-2 resize-none`}
                value={form.installation_info}
                onChange={(e) => setForm((f) => ({ ...f, installation_info: e.target.value }))}
                placeholder="Détails sur l'installation, besoins spéciaux…"
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="space-y-2 pt-1">
              <Button
                onClick={handleCreateAndOptimize}
                disabled={pending}
                className="w-full h-10 gap-2"
              >
                {pending
                  ? <><Loader2 className="size-4 animate-spin" />En cours…</>
                  : <><Sparkles className="size-4" />Créer et trouver un créneau</>
                }
              </Button>
              <Button
                variant="outline"
                onClick={handleCreateOnly}
                disabled={pending}
                className="w-full h-9"
              >
                Créer seulement
              </Button>
            </div>
          </div>
        )}

        {/* ── Étape 2 : chargement ── */}
        {step === "loading-slots" && (
          <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            Recherche des meilleurs créneaux…
          </div>
        )}

        {/* ── Étape 3 : créneaux ── */}
        {step === "slots" && createdJobId && (
          <div className="px-6 pb-6">
            <SlotChooser
              jobId={createdJobId}
              slots={slots}
              prospectLat={form.lat!}
              prospectLng={form.lng!}
              onBooked={handleBooked}
            />
            {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal d'édition complète d'un prospect ─────────────────────────────────────

const PIPELINE_STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: "prospect",              label: "Prospect" },
  { value: "soumission_en_attente", label: "Soumission en attente" },
  { value: "a_suivre",              label: "À suivre" },
  { value: "a_relancer",            label: "À relancer" },
];

type EditModalStep = "edit" | "loading-slots" | "slots";

function ProspectEditModal({
  job,
  salespeople,
  onClose,
  onBooked,
}: {
  job: PipelineJob;
  salespeople: Salesperson[];
  onClose: () => void;
  onBooked?: (msg: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<EditModalStep>("edit");
  const [showAbandon, setShowAbandon] = useState(false);
  const [slots, setSlots] = useState<ProspectSlotResult[]>([]);
  const client = job.clients;

  const [form, setForm] = useState({
    client_name:       client?.name ?? "",
    client_phone:      client?.phone ?? "",
    client_email:      client?.email ?? "",
    client_address:    client?.address_formatted ?? "",
    client_lat:        client?.lat ?? null as number | null,
    client_lng:        client?.lng ?? null as number | null,
    status:            job.status,
    salesperson_id:    job.salesperson_id ?? "",
    follow_up_date:    job.follow_up_date ?? "",
    installation_info: job.installation_info ?? "",
    internal_notes:    job.internal_notes ?? "",
  });

  // Détecte si des champs ont été modifiés par rapport aux valeurs originales
  const isDirty =
    form.client_name       !== (client?.name ?? "") ||
    form.client_phone      !== (client?.phone ?? "") ||
    form.client_email      !== (client?.email ?? "") ||
    form.client_address    !== (client?.address_formatted ?? "") ||
    form.client_lat        !== (client?.lat ?? null) ||
    form.client_lng        !== (client?.lng ?? null) ||
    form.status            !== job.status ||
    form.salesperson_id    !== (job.salesperson_id ?? "") ||
    form.follow_up_date    !== (job.follow_up_date ?? "") ||
    form.installation_info !== (job.installation_info ?? "") ||
    form.internal_notes    !== (job.internal_notes ?? "");

  const tryClose = () => {
    if (step === "slots" || !isDirty) { onClose(); return; }
    setShowAbandon(true);
  };

  const onAddressResolved = useCallback((p: ResolvedPlace) => {
    setForm((f) => ({
      ...f,
      client_address: p.address_formatted || p.address_raw,
      client_lat: p.lat,
      client_lng: p.lng,
    }));
  }, []);

  /** Persiste client + job, puis exécute afterSave() */
  const persist = async (): Promise<boolean> => {
    if (!form.client_name.trim()) { setError("Le nom est requis."); return false; }
    setError(null);

    if (client?.id) {
      const r = await updateClient(client.id, {
        name: form.client_name,
        email: form.client_email,
        phone: form.client_phone,
        address_formatted: form.client_address,
        lat: form.client_lat,
        lng: form.client_lng,
      });
      if (!r.ok) { setError(r.message); return false; }
    }

    const r = await updateJob(job.id, {
      status: form.status as JobStatus,
      estimated_duration_hours: 4,
      preferred_date: "",
      follow_up_date: form.follow_up_date,
      salesperson_id: form.salesperson_id,
      installation_info: form.installation_info,
      internal_notes: form.internal_notes,
    });
    if (!r.ok) { setError(r.message); return false; }

    return true;
  };

  const handleSaveOnly = () => {
    start(async () => {
      if (!await persist()) return;
      router.refresh();
      onClose();
    });
  };

  const handleSaveAndOptimize = () => {
    if (!form.client_lat || !form.client_lng) {
      setError("Ajoutez une adresse géolocalisée pour lancer l'optimisation.");
      return;
    }
    start(async () => {
      if (!await persist()) return;
      setStep("loading-slots");
      const res = await findBestSlotsForProspect(form.client_lat!, form.client_lng!);
      if (!res.ok) { setError(res.message); setStep("edit"); return; }
      setSlots(res.slots);
      setStep("slots");
    });
  };

  const handleBooked = (msg: string) => {
    router.refresh();
    onClose();
    onBooked?.(msg);
  };

  const inp = "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const lbl = "block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && tryClose()}
    >
      <div className={`relative bg-background rounded-xl shadow-xl w-full mx-4 max-h-[90vh] overflow-y-auto transition-[max-width] duration-200 ${step === "slots" ? "max-w-3xl" : "max-w-lg"}`}>

        {showAbandon && (
          <AbandonConfirm onConfirm={onClose} onCancel={() => setShowAbandon(false)} />
        )}

        {/* En-tête */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <div>
            {step === "edit" && (
              <>
                <h2 className="text-base font-semibold">
                  Modifier le prospect
                  {isDirty && <span className="ml-2 text-[10px] text-amber-500 font-normal normal-case">● Non sauvegardé</span>}
                </h2>
                <p className="text-xs text-muted-foreground">{form.client_name || client?.name}</p>
              </>
            )}
            {step === "loading-slots" && (
              <h2 className="text-base font-semibold">Recherche des créneaux…</h2>
            )}
            {step === "slots" && (
              <>
                <h2 className="text-base font-semibold">Choisir un créneau</h2>
                <p className="text-xs text-muted-foreground">{form.client_name}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "slots" && (
              <button
                onClick={() => setStep("edit")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" />
                Retour
              </button>
            )}
            <button onClick={tryClose} className="text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* ── Étape 1 : formulaire ── */}
        {step === "edit" && (
          <div className="px-5 py-4 space-y-5">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</p>
              <div>
                <label className={lbl}>Nom <span className="text-destructive normal-case">*</span></label>
                <input className={inp} value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Téléphone</label>
                  <input type="tel" className={inp} value={form.client_phone} onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))} placeholder="819-555-1234" />
                </div>
                <div>
                  <label className={lbl}>Courriel</label>
                  <input type="email" className={inp} value={form.client_email} onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))} placeholder="marie@exemple.com" />
                </div>
              </div>
              <div>
                <label className={lbl}>
                  Adresse
                  {form.client_lat
                    ? <span className="ml-1 text-[10px] text-emerald-600 normal-case font-normal">✓ GPS</span>
                    : <span className="ml-1 text-[10px] text-amber-500 normal-case font-normal">requis pour l'optimisation</span>
                  }
                </label>
                <AddressAutocomplete
                  value={form.client_address}
                  onChange={(v) => setForm((f) => ({ ...f, client_address: v, client_lat: null, client_lng: null }))}
                  onResolved={onAddressResolved}
                />
              </div>
            </div>

            <hr />

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dossier</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Statut</label>
                  <select className={inp} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as JobStatus }))}>
                    {PIPELINE_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Vendeur</label>
                  <select className={inp} value={form.salesperson_id} onChange={(e) => setForm((f) => ({ ...f, salesperson_id: e.target.value }))}>
                    <option value="">— Aucun —</option>
                    {salespeople.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Date de relance</label>
                <input type="date" className={inp} value={form.follow_up_date} onChange={(e) => setForm((f) => ({ ...f, follow_up_date: e.target.value }))} />
              </div>
              <div>
                <label className={lbl}>Notes / Info projet</label>
                <textarea className={`${inp} h-20 py-2 resize-none`} value={form.installation_info} onChange={(e) => setForm((f) => ({ ...f, installation_info: e.target.value }))} placeholder="Détails sur l'installation, besoins spéciaux…" />
              </div>
              <div>
                <label className={lbl}>Notes internes</label>
                <textarea className={`${inp} h-16 py-2 resize-none`} value={form.internal_notes} onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))} placeholder="Notes privées…" />
              </div>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <div className="space-y-2 pb-1">
              <Button
                onClick={handleSaveAndOptimize}
                disabled={pending}
                className="w-full h-10 gap-2"
              >
                {pending
                  ? <><Loader2 className="size-4 animate-spin" />En cours…</>
                  : <><Sparkles className="size-4" />Sauvegarder et trouver un créneau</>
                }
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveOnly}
                disabled={pending}
                className="w-full h-9"
              >
                Sauvegarder seulement
              </Button>
              <Button
                variant="ghost"
                onClick={tryClose}
                disabled={pending}
                className="w-full h-9 text-muted-foreground"
              >
                Annuler
              </Button>
            </div>
          </div>
        )}

        {/* ── Étape 2 : chargement ── */}
        {step === "loading-slots" && (
          <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            Recherche des meilleurs créneaux…
          </div>
        )}

        {/* ── Étape 3 : liste des créneaux ── */}
        {step === "slots" && (
          <div className="px-5 py-4">
            <SlotChooser
              jobId={job.id}
              slots={slots}
              prospectLat={form.client_lat!}
              prospectLng={form.client_lng!}
              onBooked={handleBooked}
            />
            {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Toast de confirmation booking ─────────────────────────────────────────────

function BookingToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border bg-background shadow-lg px-4 py-3 text-sm font-medium max-w-sm">
      <span className="text-emerald-600">✓</span>
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
    </div>
  );
}

// ── Mode Liste : créneaux optimisés ───────────────────────────────────────────

function OptimizedList({
  jobId,
  slots,
  onBooked,
}: {
  jobId: string;
  slots: ProspectSlotResult[];
  onBooked: (msg: string) => void;
}) {
  const [booking, startBook] = useTransition();
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Garder seulement le meilleur créneau par combinaison vendeur+jour.
  // Les slots arrivent déjà triés par score (meilleur en premier),
  // donc le premier occurrence de chaque clé est automatiquement le meilleur.
  const seen = new Set<string>();
  const dedupedSlots = slots.filter((s) => {
    const key = `${s.salesperson_id}|${s.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const book = (s: ProspectSlotResult) => {
    setBookingSlot(`${s.date}|${s.start_time}`);
    setError(null);
    startBook(async () => {
      const res = await bookProspectToSlot({
        jobId,
        salespersonId: s.salesperson_id,
        scheduledDate: s.date,
        startTime: s.start_time,
      });
      setBookingSlot(null);
      if (!res.ok) { setError(res.message); return; }
      onBooked(`RDV confirmé — ${s.dateFormatted} à ${s.start_time} avec ${s.salesperson_name}`);
    });
  };

  if (dedupedSlots.length === 0) return (
    <p className="text-sm text-muted-foreground py-2">Aucun créneau disponible dans les 30 prochains jours.</p>
  );

  return (
    <div className="space-y-1.5">
      {dedupedSlots.map((s, i) => {
        const key = `${s.salesperson_id}-${s.date}-${s.start_time}`;
        const isLoading = booking && bookingSlot === `${s.date}|${s.start_time}`;
        return (
          <button
            key={key}
            onClick={() => book(s)}
            disabled={booking}
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
            {isLoading
              ? <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
              : <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            }
          </button>
        );
      })}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

// ── Mode Calendrier : grille semaine ──────────────────────────────────────────

function WeekCalendar({
  jobId,
  prospectLat,
  prospectLng,
  onBooked,
}: {
  jobId: string;
  prospectLat: number;
  prospectLng: number;
  onBooked: (msg: string) => void;
}) {
  const [monday, setMonday] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [weekData, setWeekData] = useState<SalespersonWeekData[] | null>(null);
  const [loading, startLoad] = useTransition();
  const [booking, startBook] = useTransition();
  const [bookingKey, setBookingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weekStr = format(monday, "yyyy-MM-dd");

  const loadWeek = (newMonday: Date) => {
    setMonday(newMonday);
    setWeekData(null);
    setError(null);
    startLoad(async () => {
      const res = await getSlotsForWeekWithScores(prospectLat, prospectLng, format(newMonday, "yyyy-MM-dd"));
      if (!res.ok) { setError(res.message); return; }
      setWeekData(res.data);
    });
  };

  // Charger la semaine courante au montage
  useEffect(() => {
    loadWeek(monday);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const book = (sp: SalespersonWeekData, dateStr: string, slot: string) => {
    const key = `${sp.salesperson_id}|${dateStr}|${slot}`;
    setBookingKey(key);
    setError(null);
    startBook(async () => {
      const res = await bookProspectToSlot({
        jobId,
        salespersonId: sp.salesperson_id,
        scheduledDate: dateStr,
        startTime: slot,
      });
      setBookingKey(null);
      if (!res.ok) { setError(res.message); return; }
      const dayLabel = format(parseISO(dateStr), "EEEE d MMM", { locale: fr });
      onBooked(`RDV confirmé — ${dayLabel} à ${slot} avec ${sp.salesperson_name}`);
    });
  };

  return (
    <div className="space-y-3">
      {/* Navigation semaine */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => loadWeek(subWeeks(monday, 1))}
          disabled={loading || booking}
          className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium flex-1 text-center">
          Semaine du {format(monday, "d MMM yyyy", { locale: fr })}
        </span>
        <button
          onClick={() => loadWeek(addWeeks(monday, 1))}
          disabled={loading || booking}
          className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Calcul des distances…
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {weekData && weekData.map((sp) => (
        <div key={sp.salesperson_id} className="rounded-lg border overflow-hidden">
          {/* En-tête vendeur */}
          <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold">{sp.salesperson_name}</div>

          {/* Grille */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/20">
                  <th className="w-14 px-2 py-1.5 text-left text-muted-foreground font-medium border-r">Heure</th>
                  {sp.days.map((day, i) => (
                    <th key={day.date} className="px-1 py-1.5 text-center font-medium border-r last:border-r-0 min-w-[90px]">
                      <div className="text-muted-foreground/70">{DAY_LABELS[i]}</div>
                      <div>{format(parseISO(day.date), "d MMM", { locale: fr })}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Collecte tous les créneaux de la semaine */}
                {["08:00","09:30","11:00","12:30","14:00","15:30"].map((slot) => (
                  <tr key={slot} className="border-t hover:bg-muted/5">
                    <td className="px-2 py-1 text-muted-foreground border-r font-mono">{slot}</td>
                    {sp.days.map((day) => {
                      if (day.dayOff) {
                        return (
                          <td key={day.date} className="px-1 py-1 border-r last:border-r-0 bg-muted/20 text-center">
                            <span className="text-[10px] text-muted-foreground">Congé</span>
                          </td>
                        );
                      }

                      const cell = day.cells.find((c) => c.slot === slot);
                      if (!cell) {
                        return (
                          <td key={day.date} className="px-1 py-1 border-r last:border-r-0 bg-muted/10" />
                        );
                      }

                      if (cell.occupied) {
                        return (
                          <td key={day.date} className="px-1 py-1 border-r last:border-r-0 bg-muted/30">
                            <div className="text-[10px] text-muted-foreground leading-tight truncate max-w-[88px]" title={cell.occupiedBy ?? ""}>
                              {cell.occupiedBy}
                            </div>
                          </td>
                        );
                      }

                      const bKey = `${sp.salesperson_id}|${day.date}|${slot}`;
                      const isBooking = booking && bookingKey === bKey;

                      return (
                        <td key={day.date} className="px-1 py-1 border-r last:border-r-0 h-10 align-top">
                          <button
                            onClick={() => book(sp, day.date, slot)}
                            disabled={booking}
                            className="w-full h-full rounded flex flex-col items-center justify-center gap-0.5 hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50 group"
                            title={`${cell.prevLabel} · détour ${fmtDist(cell.detourMeters)}`}
                          >
                            {isBooking ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <>
                                <span className="text-[10px] text-emerald-600 font-medium">{fmtDist(cell.detourMeters)}</span>
                                <span className="text-[9px] text-muted-foreground group-hover:text-primary/70 leading-tight text-center truncate w-full px-1">
                                  {cell.prevLabel}
                                </span>
                              </>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── SlotChooser : liste optimisée + toggle calendrier ─────────────────────────

function SlotChooser({
  jobId,
  slots,
  prospectLat,
  prospectLng,
  onBooked,
}: {
  jobId: string;
  slots: ProspectSlotResult[];
  prospectLat: number;
  prospectLng: number;
  onBooked: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"list" | "calendar">("list");

  return (
    <div className="space-y-3">
      {/* Toggle liste / calendrier */}
      <div className="flex rounded-lg border overflow-hidden text-xs">
        <button
          onClick={() => setMode("list")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
            mode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          <Sparkles className="size-3" />
          Meilleur créneau
        </button>
        <button
          onClick={() => setMode("calendar")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 font-medium transition-colors border-l ${
            mode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          <CalendarDays className="size-3" />
          Par semaine
        </button>
      </div>

      {mode === "list" && (
        <OptimizedList jobId={jobId} slots={slots} onBooked={onBooked} />
      )}
      {mode === "calendar" && (
        <WeekCalendar
          jobId={jobId}
          prospectLat={prospectLat}
          prospectLng={prospectLng}
          onBooked={onBooked}
        />
      )}
    </div>
  );
}

// ── Optimiseur complet (liste + calendrier) ────────────────────────────────────

type OptimizerMode = "list" | "calendar";

function ProspectOptimizer({
  job,
  onClose,
  onBooked,
}: {
  job: PipelineJob;
  onClose: () => void;
  onBooked: (msg: string) => void;
}) {
  const [mode, setMode] = useState<OptimizerMode>("list");
  const [slots, setSlots] = useState<ProspectSlotResult[]>([]);
  const [loading, startLoad] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [listLoaded, setListLoaded] = useState(false);

  const lat = job.clients?.lat;
  const lng = job.clients?.lng;
  const noGps = !lat || !lng;

  const loadList = () => {
    if (!lat || !lng) return;
    setError(null);
    setListLoaded(true);
    startLoad(async () => {
      const res = await findBestSlotsForProspect(lat, lng);
      if (!res.ok) { setError(res.message); return; }
      setSlots(res.slots);
    });
  };

  // Charger la liste auto au premier affichage
  useEffect(() => {
    if (mode === "list" && !listLoaded && !noGps) {
      loadList();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-3 border rounded-xl bg-muted/5 p-4 space-y-3">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="size-4 text-primary" />
          Trouver un créneau
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>

      {noGps ? (
        <p className="text-xs text-amber-600">
          Adresse non géolocalisée — modifiez la fiche client pour ajouter une adresse Google.
        </p>
      ) : (
        <>
          {/* Toggle mode */}
          <div className="flex rounded-lg border overflow-hidden text-xs">
            <button
              onClick={() => setMode("list")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${mode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <Sparkles className="size-3" />
              Meilleur créneau
            </button>
            <button
              onClick={() => setMode("calendar")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 font-medium transition-colors border-l ${mode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <CalendarDays className="size-3" />
              Par calendrier
            </button>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          {mode === "list" && (
            loading
              ? <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="size-4 animate-spin" />Calcul en cours…</div>
              : <OptimizedList jobId={job.id} slots={slots} onBooked={onBooked} />
          )}

          {mode === "calendar" && (
            <WeekCalendar
              jobId={job.id}
              prospectLat={lat}
              prospectLng={lng}
              onBooked={onBooked}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Carte d'un prospect ────────────────────────────────────────────────────────

function ProspectCard({
  job,
  salespeople,
  onBooked,
}: {
  job: PipelineJob;
  salespeople: Salesperson[];
  onBooked: (msg: string) => void;
}) {
  const router = useRouter();
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [statusPending, startStatus] = useTransition();
  const client = job.clients;

  const createdAt = format(new Date(job.created_at), "d MMM yyyy", { locale: fr });
  const followUp = job.follow_up_date
    ? format(new Date(job.follow_up_date + "T12:00:00"), "d MMM yyyy", { locale: fr })
    : null;

  const handleStatusChange = (newStatus: string) => {
    startStatus(async () => {
      await updateJobStatus(job.id, newStatus);
      router.refresh();
    });
  };

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4 space-y-3">
        {/* Ligne 1 : nom + vendeur + GPS */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{client?.name ?? "Client sans nom"}</span>
              {job.salespeople
                ? <Badge variant="outline" className="text-[10px]">{job.salespeople.name}</Badge>
                : <span className="text-[10px] text-muted-foreground italic">Non assigné</span>
              }
              {client?.lat && <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><MapPin className="size-2.5" />GPS</span>}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {client?.phone && <span className="flex items-center gap-1"><Phone className="size-3" />{client.phone}</span>}
              {client?.city && <span className="flex items-center gap-1"><MapPin className="size-3" />{client.city}</span>}
              <span>Créé le {createdAt}</span>
              {followUp && <span className="text-amber-600 font-medium">Relancer : {followUp}</span>}
            </div>
            {job.installation_info && (
              <p className="text-xs text-muted-foreground line-clamp-2">{job.installation_info}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowEdit(true)}
              className="h-8 px-2"
              title="Modifier la fiche"
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant={showOptimizer ? "default" : "outline"}
              onClick={() => setShowOptimizer((s) => !s)}
              className="gap-1.5"
            >
              {showOptimizer ? <X className="size-3.5" /> : <Sparkles className="size-3.5" />}
              {showOptimizer ? "Fermer" : "Trouver créneau"}
            </Button>
          </div>
        </div>

        {/* Ligne 2 : sélecteur de statut rapide */}
        <div className="flex items-center gap-2">
          {statusPending
            ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Mise à jour…</span>
            : (
              <div className="flex flex-wrap gap-1.5">
                {PIPELINE_STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => job.status !== o.value && handleStatusChange(o.value)}
                    disabled={statusPending}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                      job.status === o.value
                        ? statusColor(o.value)
                        : "border hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )
          }
        </div>

        {showOptimizer && (
          <ProspectOptimizer
            job={job}
            onClose={() => setShowOptimizer(false)}
            onBooked={(msg) => {
              setShowOptimizer(false);
              onBooked(msg);
            }}
          />
        )}
      </CardContent>

      {showEdit && (
        <ProspectEditModal
          job={job}
          salespeople={salespeople}
          onClose={() => setShowEdit(false)}
          onBooked={(msg) => { setShowEdit(false); onBooked(msg); }}
        />
      )}
    </Card>
  );
}

// ── Composant principal Pipeline ───────────────────────────────────────────────

const PIPELINE_STATUSES: JobStatus[] = [
  "prospect",
  "soumission_en_attente",
  "a_suivre",
  "a_relancer",
];

export function PipelineClient({
  jobs,
  salespeople,
  currentSalespersonId = null,
}: {
  jobs: PipelineJob[];
  salespeople: Salesperson[];
  /** null = admin/secrétaire (voit tout). string = vendeur connecté (Phase 2). */
  currentSalespersonId?: string | null;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<JobStatus | "all">("all");
  const [filterSalesperson, setFilterSalesperson] = useState<string>(
    currentSalespersonId ?? "all"
  );
  const router = useRouter();

  const handleBooked = (msg: string) => {
    setToast(msg);
    router.refresh();
    setTimeout(() => setToast(null), 5000);
  };

  // Filtre de base selon le rôle (vendeur voit seulement ses dossiers)
  const roleFiltered = useMemo(
    () =>
      currentSalespersonId
        ? jobs.filter((j) => j.salesperson_id === currentSalespersonId)
        : jobs,
    [jobs, currentSalespersonId]
  );

  // Filtres actifs (statut + vendeur + recherche)
  const filteredJobs = useMemo(() => {
    return roleFiltered.filter((j) => {
      if (filterStatus !== "all" && j.status !== filterStatus) return false;
      if (!currentSalespersonId && filterSalesperson !== "all" && j.salesperson_id !== filterSalesperson) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const c = j.clients;
        return (
          c?.name?.toLowerCase().includes(q) ||
          c?.phone?.toLowerCase().includes(q) ||
          c?.email?.toLowerCase().includes(q) ||
          c?.address_formatted?.toLowerCase().includes(q) ||
          false
        );
      }
      return true;
    });
  }, [roleFiltered, filterStatus, filterSalesperson, search, currentSalespersonId]);

  // Counts pour le dashboard (sur les jobs filtrés par rôle + vendeur, sans filtre statut)
  const baseForCounts = useMemo(
    () =>
      roleFiltered.filter((j) =>
        !currentSalespersonId && filterSalesperson !== "all"
          ? j.salesperson_id === filterSalesperson
          : true
      ),
    [roleFiltered, filterSalesperson, currentSalespersonId]
  );

  const statusCounts = useMemo(
    () =>
      PIPELINE_STATUSES.map((s) => ({
        status: s,
        count: baseForCounts.filter((j) => j.status === s).length,
      })),
    [baseForCounts]
  );

  const grouped = PIPELINE_STATUSES.map((status) => ({
    status,
    jobs: filteredJobs.filter((j) => j.status === status),
  })).filter((g) => g.jobs.length > 0);

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline ventes</h1>
          <p className="text-muted-foreground text-sm">
            {roleFiltered.length === 0
              ? "Aucun prospect en attente."
              : `${roleFiltered.length} dossier${roleFiltered.length > 1 ? "s" : ""} en cours de vente.`}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/ventes"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            Calendrier ventes
          </a>
          <Button onClick={() => setShowCreate(true)} className="h-[38px] gap-1.5">
            <Plus className="size-4" />
            Nouveau prospect
          </Button>
        </div>
      </div>

      {/* Dashboard rapide — statuts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {statusCounts.map(({ status, count }) => (
          <button
            key={status}
            onClick={() => setFilterStatus((s) => (s === status ? "all" : status))}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
              filterStatus === status
                ? "border-primary bg-primary/5"
                : "hover:bg-muted"
            }`}
          >
            <div className="text-2xl font-bold tabular-nums">{count}</div>
            <div className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold mt-1 ${statusColor(status)}`}>
              {statusLabel(status)}
            </div>
          </button>
        ))}
      </div>

      {/* Barre de filtres */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Recherche */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            className="border-input bg-background h-9 w-full rounded-lg border pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Nom, adresse, téléphone, courriel…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Filtre vendeur (caché si vendeur connecté) */}
        {!currentSalespersonId && salespeople.length > 1 && (
          <select
            className="border-input bg-background h-9 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filterSalesperson}
            onChange={(e) => setFilterSalesperson(e.target.value)}
          >
            <option value="all">Tous les vendeurs</option>
            {salespeople.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        )}

        {/* Badge filtre statut actif */}
        {filterStatus !== "all" && (
          <button
            onClick={() => setFilterStatus("all")}
            className={`h-9 inline-flex items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${statusColor(filterStatus)}`}
          >
            {statusLabel(filterStatus)}
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Résultats */}
      {filteredJobs.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {search || filterStatus !== "all" || filterSalesperson !== "all"
              ? "Aucun résultat pour ces filtres."
              : "Aucun dossier en cours. Créez un prospect avec le bouton ci-dessus."}
          </CardContent>
        </Card>
      )}

      {grouped.map(({ status, jobs: groupJobs }) => (
        <div key={status}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(status)}`}>
              {statusLabel(status)}
            </span>
            <span className="text-xs text-muted-foreground">
              {groupJobs.length} dossier{groupJobs.length > 1 ? "s" : ""}
            </span>
          </div>
          <ul className="space-y-2">
            {groupJobs.map((job) => (
              <li key={job.id}>
                <ProspectCard job={job} salespeople={salespeople} onBooked={handleBooked} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {showCreate && (
        <QuickProspectModal
          salespeople={salespeople}
          onClose={() => { setShowCreate(false); router.refresh(); }}
          onBooked={(msg) => { setShowCreate(false); handleBooked(msg); }}
        />
      )}

      {toast && <BookingToast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
