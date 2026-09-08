"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  FileText,
  Loader2,
  Home,
  MapPin,
  Pencil,
  Plus,
  Search,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { addDays, addWeeks, format, parseISO, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddressAutocomplete, type ResolvedPlace } from "@/components/maps/address-autocomplete";
import {
  bookProspectToSlot,
  findBestSlotsForProspect,
  getSlotsForWeekWithScores,
  type ProspectSlotResult,
  type SalespersonWeekData,
} from "@/actions/sales";
import {
  createProspect,
  createJobOnExistingAddress,
  checkInstallationAddressExists,
  type AddressMatch,
} from "@/actions/prospects";
import { updateClient, updateJob, addInstallationAddress, updateInstallationAddress } from "@/actions/clients";
import { fetchMoreEnAttente } from "@/actions/pipeline";
import { PIPELINE_PAGE_SIZE } from "@/lib/pipeline-config";
import { TravelDuration, formatTravelDurationLabel } from "@/lib/format-travel";
import { isPastYmd, todayYmd } from "@/lib/address";
import { defaultBusinessWeekMonday } from "@/lib/dispatch/business-week";
import { updateJobStatus, updateJobFlag } from "@/actions/jobs";
import { statusLabel, statusColor, flagColor, flagLabel } from "@/lib/job-status";
import { cn } from "@/lib/utils";
import { CANCELLATION_REASONS } from "@/types/domain";
import type { JobStatus, FollowUpFlag, Salesperson } from "@/types/domain";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PipelineInstallationAddress = {
  lat: number | null;
  lng: number | null;
  address_formatted: string | null;
  city: string | null;
};

export type PipelineJob = {
  id: string;
  status: JobStatus;
  follow_up_flag: FollowUpFlag;
  appointment_id: string | null;
  /** Date du RDV lié (YYYY-MM-DD) — pour badge RDV passé */
  appointment_date: string | null;
  has_quote: boolean;
  quote_number: number | null;
  salesperson_id: string | null;
  /** Ownership volontaire → filtrer les suggestions sur ce vendeur. */
  salesperson_locked: boolean;
  installation_info: string | null;
  internal_notes: string | null;
  follow_up_date: string | null;
  created_at: string;
  installation_address_id: string | null;
  installation_address: PipelineInstallationAddress | null;
  clients: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    billing_address: string | null;
    billing_city: string | null;
    billing_postal: string | null;
  } | null;
  salespeople: { name: string } | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Bloc double adresse réutilisable ──────────────────────────────────────────
// Règle : GPS = installation uniquement. Facturation = texte seulement.
// UX : installation d'abord → checkbox « même adresse » → facturation.

export type DualAddressState = {
  billing_address: string;
  billing_city: string;
  billing_postal: string;
  same_address: boolean;
  install_address: string;
  install_city: string;
  install_postal: string;
  install_lat: number | null;
  install_lng: number | null;
};

export function emptyDualAddress(): DualAddressState {
  return {
    billing_address: "", billing_city: "", billing_postal: "",
    same_address: false,
    install_address: "", install_city: "", install_postal: "",
    install_lat: null, install_lng: null,
  };
}

/** Filtre vendeur pour l'optimisation : uniquement si ownership verrouillé. */
function optimizationSalespersonFilter(
  locked: boolean,
  salespersonId: string | null
): string | null {
  return locked && salespersonId ? salespersonId : null;
}

export function DualAddressBlock({
  state,
  onChange,
  disabled,
  inp,
  lbl,
  required,
}: {
  state: DualAddressState;
  onChange: (patch: Partial<DualAddressState>) => void;
  disabled?: boolean;
  inp: string;
  lbl: string;
  required?: boolean;
}) {
  /** Installation : seule source GPS. Si « même adresse », synchronise le texte facturation. */
  const onInstallResolved = useCallback((p: ResolvedPlace) => {
    const addr = p.address_formatted || p.address_raw;
    const patch: Partial<DualAddressState> = {
      install_address: addr,
      install_city: p.city,
      install_postal: p.postal_code,
      install_lat: p.lat,
      install_lng: p.lng,
    };
    if (state.same_address) {
      Object.assign(patch, {
        billing_address: addr,
        billing_city: p.city,
        billing_postal: p.postal_code,
      });
    }
    onChange(patch);
  }, [state.same_address, onChange]);

  /** Facturation : texte seulement, aucun GPS. */
  const onBillingResolved = useCallback((p: ResolvedPlace) => {
    onChange({
      billing_address: p.address_formatted || p.address_raw,
      billing_city: p.city,
      billing_postal: p.postal_code,
    });
  }, [onChange]);

  const handleSameAddress = (checked: boolean) => {
    if (checked) {
      onChange({
        same_address: true,
        billing_address: state.install_address,
        billing_city: state.install_city,
        billing_postal: state.install_postal,
      });
    } else {
      onChange({ same_address: false });
    }
  };

  return (
    <div className="space-y-3">
      {/* ── Installation (GPS) ── */}
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Installation</p>
      <div>
        <label className={lbl}>
          Adresse d&apos;installation
          {required && <span className="text-destructive text-base font-bold leading-none ml-0.5">*</span>}
          {state.install_lat
            ? <span className="ml-1 text-[10px] text-emerald-600 font-normal">✓ GPS</span>
            : <span className="ml-1 text-[10px] text-amber-500 font-normal">sélectionnez dans Google pour le GPS</span>
          }
        </label>
        <AddressAutocomplete
          value={state.install_address}
          onChange={(v) => onChange({ install_address: v, install_lat: null, install_lng: null })}
          onResolved={onInstallResolved}
          disabled={disabled}
        />
      </div>

      {/* ── Checkbox ── */}
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={state.same_address}
          onChange={(e) => handleSameAddress(e.target.checked)}
          disabled={disabled}
          className="rounded"
        />
        Même adresse que l&apos;installation
      </label>

      {/* ── Facturation (texte seulement) ── */}
      {!state.same_address && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Facturation</p>
          <div>
            <label className={lbl}>Adresse de facturation</label>
            <AddressAutocomplete
              value={state.billing_address}
              onChange={(v) => onChange({ billing_address: v })}
              onResolved={onBillingResolved}
              disabled={disabled}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Ville</label>
              <input className={inp} value={state.billing_city} onChange={(e) => onChange({ billing_city: e.target.value })} disabled={disabled} />
            </div>
            <div>
              <label className={lbl}>Code postal</label>
              <input className={inp} value={state.billing_postal} onChange={(e) => onChange({ billing_postal: e.target.value })} disabled={disabled} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Création rapide d'un prospect ─────────────────────────────────────────────

type CreateStep = "form" | "intercept" | "loading-slots" | "slots";

const OPEN_JOB_STATUSES = [
  "soumission_en_attente", "soumission_repartie", "en_attente",
  "a_planifier", "reparti", "retour_a_faire",
] as const;

export function QuickProspectModal({
  onClose,
  salespeople,
  onBooked,
}: {
  onClose: () => void;
  salespeople: Salesperson[];
  onBooked?: (msg: string, bookedJobId?: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<CreateStep>("form");
  const [showAbandon, setShowAbandon] = useState(false);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);
  const [slots, setSlots] = useState<ProspectSlotResult[]>([]);
  const [form, setForm] = useState({
    name: "", phone: "", email: "",
    ...emptyDualAddress(),
    installation_info: "",
    salesperson_id: "",
    salesperson_locked: false,
  });

  // ── Interception adresse connue ────────────────────────────────────────────
  const [addrMatches, setAddrMatches] = useState<AddressMatch[] | null>(null);
  const [interceptAction, setInterceptAction] = useState<"direct" | "rdv" | null>(null);
  const [selectedMatchIdx, setSelectedMatchIdx] = useState(0);
  const [ownerChoice, setOwnerChoice] = useState<"same" | "new">("new");

  // Vérifie l'adresse dès que Google Places la résout (install_lat passe de null à une valeur)
  useEffect(() => {
    if (form.install_address && form.install_lat != null) {
      checkInstallationAddressExists(form.install_address).then((res) => {
        if (res.ok && res.matches.length > 0) {
          setAddrMatches(res.matches);
          setSelectedMatchIdx(0);
        } else {
          setAddrMatches(null);
        }
      });
    } else {
      setAddrMatches(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.install_address, form.install_lat]);

  const setAddr = useCallback((patch: Partial<DualAddressState>) => setForm((f) => ({ ...f, ...patch })), []);

  const addrState: DualAddressState = {
    billing_address: form.billing_address, billing_city: form.billing_city, billing_postal: form.billing_postal,
    same_address: form.same_address,
    install_address: form.install_address, install_city: form.install_city, install_postal: form.install_postal,
    install_lat: form.install_lat, install_lng: form.install_lng,
  };

  const isDirty = !!(form.name || form.phone || form.email || form.billing_address || form.install_address || form.installation_info);

  const tryClose = () => {
    if (step === "slots" || !isDirty) { onClose(); return; }
    setShowAbandon(true);
  };

  /** Crée le prospect, retourne le jobId ou null en cas d'erreur */
  const doCreate = async (): Promise<string | null> => {
    if (!form.name.trim()) { setError("Le nom est requis."); return null; }
    if (!form.phone.trim()) { setError("Le numéro de téléphone est requis."); return null; }
    if (!form.email.trim() || !form.email.includes("@")) { setError("Le courriel est requis."); return null; }
    if (!form.install_address.trim() || form.install_lat == null) {
      setError("L'adresse d'installation est requise — sélectionnez-la dans la liste Google.");
      return null;
    }
    setError(null);
    const res = await createProspect({
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      billing_address: (form.same_address ? form.install_address : form.billing_address) || null,
      billing_city: (form.same_address ? form.install_city : form.billing_city) || null,
      billing_postal: (form.same_address ? form.install_postal : form.billing_postal) || null,
      install_address: form.install_address || null,
      install_city: form.install_city || null,
      install_postal: form.install_postal || null,
      install_lat: form.install_lat,
      install_lng: form.install_lng,
      installation_info: form.installation_info || null,
      salesperson_id: form.salesperson_id || null,
      salesperson_locked: form.salesperson_locked && !!form.salesperson_id,
    });
    if (!res.ok) { setError(res.message); return null; }
    return res.jobId;
  };

  const handleCreateOnly = () => {
    if (addrMatches && addrMatches.length > 0) {
      setInterceptAction("direct");
      setStep("intercept");
      return;
    }
    start(async () => {
      const jobId = await doCreate();
      if (!jobId) return;
      router.refresh();
      onClose();
    });
  };

  const handleCreateAndOptimize = () => {
    if (!form.install_lat || !form.install_lng) {
      setError("Sélectionnez l'adresse d'installation dans Google pour activer le GPS.");
      return;
    }
    if (addrMatches && addrMatches.length > 0) {
      setInterceptAction("rdv");
      setStep("intercept");
      return;
    }
    start(async () => {
      const jobId = await doCreate();
      if (!jobId) return;
      setCreatedJobId(jobId);
      setStep("loading-slots");
      const filterSp = form.salesperson_locked ? (form.salesperson_id || null) : null;
      const res = await findBestSlotsForProspect(form.install_lat!, form.install_lng!, 10, filterSp, undefined, form.install_city || null);
      if (!res.ok) { setError(res.message); setStep("form"); return; }
      setSlots(res.slots);
      setStep("slots");
      router.refresh();
    });
  };

  /** Confirme la création depuis l'écran d'interception */
  const handleConfirmIntercept = () => {
    if (!addrMatches || !interceptAction) return;
    const match = addrMatches[selectedMatchIdx];
    start(async () => {
      setError(null);
      const res = await createJobOnExistingAddress({
        installationAddressId: match.installation_address_id,
        mode: "blank",
        newOwner:
          ownerChoice === "new" && form.name.trim()
            ? { name: form.name.trim(), phone: form.phone || null, email: form.email || null }
            : undefined,
        enrichWith:
          ownerChoice === "same"
            ? { phone: form.phone || null, email: form.email || null }
            : undefined,
      });
      if (!res.ok) { setError(res.message); return; }

      if (interceptAction === "direct") {
        router.push(`/ventes/pipeline?job=${res.jobId}`);
        onClose();
        return;
      }

      // Chemin RDV : utiliser GPS de la row existante si dispo
      const lat = res.installLat ?? form.install_lat!;
      const lng = res.installLng ?? form.install_lng!;
      setCreatedJobId(res.jobId);
      setStep("loading-slots");
      const filterSp = form.salesperson_locked ? (form.salesperson_id || null) : null;
      const slotsRes = await findBestSlotsForProspect(lat, lng, 10, filterSp, undefined, form.install_city || null);
      if (!slotsRes.ok) { setError(slotsRes.message); setStep("intercept"); return; }
      setSlots(slotsRes.slots);
      setStep("slots");
      router.refresh();
    });
  };

  const handleBooked = (msg: string, bookedJobId?: string) => {
    onClose();
    onBooked?.(msg, bookedJobId ?? createdJobId ?? undefined);
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
              <label className={lbl}>Nom complet <span className="text-destructive text-base font-bold leading-none">*</span></label>
              <input className={inp} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Marie Tremblay" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Téléphone <span className="text-destructive text-base font-bold leading-none">*</span></label>
                <input type="tel" className={inp} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="819-555-1234" />
              </div>
              <div>
                <label className={lbl}>Courriel <span className="text-destructive text-base font-bold leading-none">*</span></label>
                <input type="email" className={inp} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="marie@example.com" />
              </div>
            </div>
            <DualAddressBlock state={addrState} onChange={setAddr} disabled={pending} inp={inp} lbl={lbl} required />
            {salespeople.length > 0 && (
              <div className="space-y-2">
                <div>
                  <label className={lbl}>Vendeur assigné</label>
                  <select
                    className={inp}
                    value={form.salesperson_id}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      salesperson_id: e.target.value,
                      salesperson_locked: e.target.value ? f.salesperson_locked : false,
                    }))}
                  >
                    <option value="">— Aucun —</option>
                    {salespeople.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                  </select>
                </div>
                {form.salesperson_id && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.salesperson_locked}
                      onChange={(e) => setForm((f) => ({ ...f, salesperson_locked: e.target.checked }))}
                      className="rounded"
                    />
                    Verrouiller ce vendeur
                    <span className="text-[11px] text-muted-foreground font-normal">
                      (suggestions uniquement dans son horaire)
                    </span>
                  </label>
                )}
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

        {/* ── Étape interception : adresse déjà connue ── */}
        {step === "intercept" && addrMatches && (() => {
          const match = addrMatches[selectedMatchIdx];
          const hasOpenJob = match?.jobs.some((j) =>
            (OPEN_JOB_STATUSES as readonly string[]).includes(j.status)
          );
          const nameDiffers = form.name.trim().toLowerCase() !== match?.client_name.toLowerCase();
          return (
            <div className="px-6 pb-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Cette adresse d&apos;installation est déjà dans la base de données.
              </p>

              {/* Liste des matches */}
              <div className="space-y-2">
                {addrMatches.map((m, idx) => {
                  const openJob = m.jobs.find((j) => (OPEN_JOB_STATUSES as readonly string[]).includes(j.status));
                  return (
                    <label
                      key={m.installation_address_id}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${selectedMatchIdx === idx ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                    >
                      <input
                        type="radio"
                        name="match"
                        checked={selectedMatchIdx === idx}
                        onChange={() => setSelectedMatchIdx(idx)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{m.client_name}</p>
                        {m.client_phone && <p className="text-xs text-muted-foreground">{m.client_phone}</p>}
                        <p className="text-[11px] text-muted-foreground truncate">{m.address_formatted}</p>
                        {openJob && (
                          <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                            Job ouverte · {openJob.quote_number ? `#${openJob.quote_number}` : openJob.status}
                          </p>
                        )}
                        {m.jobs.length === 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 italic">Aucune soumission</p>
                        )}
                      </div>
                      <a
                        href={`/clients/adresse/${m.installation_address_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] text-sky-600 hover:underline shrink-0 mt-0.5"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Fiche →
                      </a>
                    </label>
                  );
                })}
              </div>

              {/* Bandeau avertissement si job ouverte */}
              {hasOpenJob && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                  <span>Une soumission est déjà en cours pour ce lieu. Vous pouvez quand même en créer une nouvelle.</span>
                </div>
              )}

              {/* Choix proprio (si nom différent) */}
              {nameDiffers && form.name.trim() && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">
                    Vous avez saisi &laquo;&nbsp;{form.name}&nbsp;&raquo; mais le dossier existant est au nom de &laquo;&nbsp;{match?.client_name}&nbsp;&raquo;.
                  </p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="ownerChoice" value="new" checked={ownerChoice === "new"} onChange={() => setOwnerChoice("new")} />
                    Nouveau propriétaire (créer un nouveau client)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="ownerChoice" value="same" checked={ownerChoice === "same"} onChange={() => setOwnerChoice("same")} />
                    Même personne (utiliser le client existant)
                  </label>
                </div>
              )}

              {error && <p className="text-destructive text-sm">{error}</p>}

              <div className="space-y-2 pt-1">
                <Button
                  onClick={handleConfirmIntercept}
                  disabled={pending}
                  className="w-full h-10 gap-2"
                >
                  {pending
                    ? <><Loader2 className="size-4 animate-spin" />En cours…</>
                    : <><FilePlus className="size-4" />Nouvelle soumission{interceptAction === "rdv" ? " + créneau" : ""}</>
                  }
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setStep("form"); setError(null); }}
                  disabled={pending}
                  className="w-full h-9"
                >
                  ← Retour au formulaire
                </Button>
              </div>
            </div>
          );
        })()}

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
              prospectLat={form.install_lat!}
              prospectLng={form.install_lng!}
              salespersonId={form.salesperson_locked ? (form.salesperson_id || null) : null}
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
  { value: "soumission_en_attente", label: "Prospect" },
  { value: "soumission_repartie",   label: "Visite planifiée" },
  { value: "en_attente",            label: "Va nous rappeler" },
  { value: "annule",                label: "Annulé" },
];

// ── Modal d'annulation (Dialog) ───────────────────────────────────────────────

function CancelModal({
  open,
  onConfirm,
  onCancel,
  pending,
}: {
  open: boolean;
  onConfirm: (reason: string, notes: string) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const inp = "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Raison d&apos;annulation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <select
            className={inp}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">— Sélectionner —</option>
            {CANCELLATION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <textarea
            className="border-input bg-background w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            rows={3}
            placeholder="Notes additionnelles (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex gap-2 pt-1">
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!reason || pending}
              onClick={() => onConfirm(reason, notes)}
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Confirmer l'annulation"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Retour
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type EditModalStep = "edit" | "loading-slots" | "slots";

export type ProspectEditSaved = {
  client_name: string;
  client_phone: string;
  client_email: string;
  billing_address: string;
  install_address: string;
};

export function ProspectEditModal({
  job,
  salespeople,
  onClose,
  onBooked,
  onSaved,
  allowSlotBooking = true,
}: {
  job: PipelineJob;
  salespeople: Salesperson[];
  onClose: () => void;
  onBooked?: (msg: string, bookedJobId?: string) => void;
  onSaved?: (data: ProspectEditSaved) => void;
  /** false = ouvert depuis la soumission : pas de prise de RDV (évite de quitter la page). */
  allowSlotBooking?: boolean;
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
    billing_address:   client?.billing_address ?? "",
    billing_city:      client?.billing_city ?? "",
    billing_postal:    client?.billing_postal ?? "",
    same_address:      false,
    install_address:   job.installation_address?.address_formatted ?? "",
    install_city:      job.installation_address?.city ?? "",
    install_postal:    "",
    install_lat:       job.installation_address?.lat ?? null as number | null,
    install_lng:       job.installation_address?.lng ?? null as number | null,
    status:            job.status,
    salesperson_id:    job.salesperson_id ?? "",
    salesperson_locked: job.salesperson_locked,
    follow_up_date:    job.follow_up_date ?? "",
    installation_info: job.installation_info ?? "",
    internal_notes:    job.internal_notes ?? "",
  });

  const setAddr = useCallback((patch: Partial<DualAddressState>) => setForm((f) => ({ ...f, ...patch })), []);

  const addrState: DualAddressState = {
    billing_address: form.billing_address, billing_city: form.billing_city, billing_postal: form.billing_postal,
    same_address: form.same_address,
    install_address: form.install_address, install_city: form.install_city, install_postal: form.install_postal,
    install_lat: form.install_lat, install_lng: form.install_lng,
  };

  const isDirty =
    form.client_name       !== (client?.name ?? "") ||
    form.client_phone      !== (client?.phone ?? "") ||
    form.client_email      !== (client?.email ?? "") ||
    form.billing_address   !== (client?.billing_address ?? "") ||
    form.billing_city      !== (client?.billing_city ?? "") ||
    form.billing_postal    !== (client?.billing_postal ?? "") ||
    form.install_address   !== (job.installation_address?.address_formatted ?? "") ||
    form.install_lat       !== (job.installation_address?.lat ?? null) ||
    form.install_lng       !== (job.installation_address?.lng ?? null) ||
    form.status            !== job.status ||
    form.salesperson_id    !== (job.salesperson_id ?? "") ||
    form.salesperson_locked !== job.salesperson_locked ||
    form.follow_up_date    !== (job.follow_up_date ?? "") ||
    form.installation_info !== (job.installation_info ?? "") ||
    form.internal_notes    !== (job.internal_notes ?? "");

  const tryClose = () => {
    if (step === "slots" || !isDirty) { onClose(); return; }
    setShowAbandon(true);
  };

  /** Persiste client (facturation) + adresse d'installation + job */
  const persist = async (): Promise<boolean> => {
    if (!form.client_name.trim()) { setError("Le nom est requis."); return false; }
    setError(null);

    if (client?.id) {
      const r = await updateClient(client.id, {
        name: form.client_name,
        email: form.client_email,
        phone: form.client_phone,
        billing_address: form.same_address ? form.install_address : form.billing_address,
        billing_city: form.same_address ? form.install_city : form.billing_city,
        billing_postal: form.same_address ? form.install_postal : form.billing_postal,
      });
      if (!r.ok) { setError(r.message); return false; }
    }

    if (form.install_address && client?.id) {
      if (job.installation_address_id) {
        const r = await updateInstallationAddress(job.installation_address_id, {
          address_formatted: form.install_address,
          lat: form.install_lat,
          lng: form.install_lng,
        });
        if (!r.ok) { setError(r.message); return false; }
      } else {
        const r = await addInstallationAddress(client.id, {
          address_formatted: form.install_address,
          lat: form.install_lat,
          lng: form.install_lng,
        });
        if (!r.ok) { setError(r.message); return false; }
      }
    }

    const r = await updateJob(job.id, {
      status: form.status as JobStatus,
      estimated_duration_hours: 4,
      preferred_date: "",
      follow_up_date: form.follow_up_date,
      salesperson_id: form.salesperson_id,
      salesperson_locked: form.salesperson_locked && !!form.salesperson_id,
      installation_info: form.installation_info,
      internal_notes: form.internal_notes,
    });
    if (!r.ok) { setError(r.message); return false; }

    return true;
  };

  const emitSaved = () => {
    onSaved?.({
      client_name: form.client_name,
      client_phone: form.client_phone,
      client_email: form.client_email,
      billing_address: form.same_address ? form.install_address : form.billing_address,
      install_address: form.install_address,
    });
  };

  const handleSaveOnly = () => {
    start(async () => {
      if (!await persist()) return;
      emitSaved();
      router.refresh();
      onClose();
    });
  };

  const handleSaveAndOptimize = () => {
    if (!form.install_lat || !form.install_lng) {
      setError("Sélectionnez l'adresse d'installation dans Google pour activer le GPS.");
      return;
    }
    start(async () => {
      if (!await persist()) return;
      emitSaved();
      setStep("loading-slots");
      const res = await findBestSlotsForProspect(
        form.install_lat!,
        form.install_lng!,
        10,
        optimizationSalespersonFilter(form.salesperson_locked, form.salesperson_id || null),
        job.appointment_id,
        form.install_city || null,
      );
      if (!res.ok) { setError(res.message); setStep("edit"); return; }
      setSlots(res.slots);
      setStep("slots");
    });
  };

  const handleBooked = (msg: string, bookedJobId?: string) => {
    emitSaved();
    router.refresh();
    onClose();
    onBooked?.(msg, bookedJobId ?? job.id);
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
                <label className={lbl}>Nom <span className="text-destructive text-base font-bold leading-none normal-case">*</span></label>
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
              <DualAddressBlock state={addrState} onChange={setAddr} disabled={pending} inp={inp} lbl={lbl} />
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
                <div className="space-y-2">
                  <div>
                    <label className={lbl}>Vendeur</label>
                    <select
                      className={inp}
                      value={form.salesperson_id}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        salesperson_id: e.target.value,
                        salesperson_locked: e.target.value ? f.salesperson_locked : false,
                      }))}
                    >
                      <option value="">— Aucun —</option>
                      {salespeople.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                    </select>
                  </div>
                  {form.salesperson_id && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none col-span-2">
                      <input
                        type="checkbox"
                        checked={form.salesperson_locked}
                        onChange={(e) => setForm((f) => ({ ...f, salesperson_locked: e.target.checked }))}
                        className="rounded"
                      />
                      Verrouiller ce vendeur
                      <span className="text-[11px] text-muted-foreground font-normal">
                        (suggestions uniquement dans son horaire)
                      </span>
                    </label>
                  )}
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
              {allowSlotBooking && (
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
              )}
              <Button
                variant={allowSlotBooking ? "outline" : "default"}
                onClick={handleSaveOnly}
                disabled={pending}
                className="w-full h-9"
              >
                {pending && !allowSlotBooking
                  ? <><Loader2 className="size-4 animate-spin" />En cours…</>
                  : allowSlotBooking ? "Sauvegarder seulement" : "Sauvegarder"}
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
              prospectLat={form.install_lat!}
              prospectLng={form.install_lng!}
              salespersonId={optimizationSalespersonFilter(form.salesperson_locked, form.salesperson_id || null)}
              excludeAppointmentId={job.appointment_id}
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
  onBooked: (msg: string, bookedJobId?: string) => void;
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
        allowReschedule: true,
      });
      setBookingSlot(null);
      if (!res.ok) { setError(res.message); return; }
      onBooked(`RDV confirmé — ${s.dateFormatted} à ${s.start_time} avec ${s.salesperson_name}`, jobId);
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
            className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors disabled:opacity-60 ${
              s.anchoredToClient
                ? "border-emerald-500 bg-emerald-50/70 hover:bg-emerald-50"
                : "hover:bg-accent"
            }`}
          >
            <span className="shrink-0 size-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium capitalize">{s.dateFormatted} · {s.start_time}</div>
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

export type WeekSlotPick = {
  salespersonId: string;
  salespersonName: string;
  date: string;
  startTime: string;
};

/** Grille semaine pour booker un prospect OU sélectionner un créneau (déplacement). */
export function WeekCalendar({
  jobId,
  prospectLat,
  prospectLng,
  salespersonId = null,
  excludeAppointmentId = null,
  onBooked,
  onSelectSlot,
}: {
  jobId?: string;
  prospectLat: number;
  prospectLng: number;
  salespersonId?: string | null;
  excludeAppointmentId?: string | null;
  onBooked?: (msg: string, bookedJobId?: string) => void;
  /** Si fourni, remplace le booking (ex. déplacement de RDV). */
  onSelectSlot?: (pick: WeekSlotPick) => void | Promise<void>;
}) {
  const [monday, setMonday] = useState<Date>(() => defaultBusinessWeekMonday());
  const [weekData, setWeekData] = useState<SalespersonWeekData[] | null>(null);
  const [loading, startLoad] = useTransition();
  const [booking, startBook] = useTransition();
  const [bookingKey, setBookingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const todayStr = todayYmd();
  const prevWeekFriday = format(addDays(subWeeks(monday, 1), 4), "yyyy-MM-dd");
  const canGoPrev = prevWeekFriday >= todayStr;

  const loadWeek = (newMonday: Date) => {
    setMonday(newMonday);
    setWeekData(null);
    setError(null);
    startLoad(async () => {
      const res = await getSlotsForWeekWithScores(
        prospectLat,
        prospectLng,
        format(newMonday, "yyyy-MM-dd"),
        salespersonId,
        excludeAppointmentId
      );
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
    if (isPastYmd(dateStr, todayStr)) {
      setError("Impossible de réserver un créneau déjà passé.");
      return;
    }
    const key = `${sp.salesperson_id}|${dateStr}|${slot}`;
    setBookingKey(key);
    setError(null);
    startBook(async () => {
      if (onSelectSlot) {
        try {
          await onSelectSlot({
            salespersonId: sp.salesperson_id,
            salespersonName: sp.salesperson_name,
            date: dateStr,
            startTime: slot,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erreur");
        } finally {
          setBookingKey(null);
        }
        return;
      }

      if (!jobId || !onBooked) {
        setBookingKey(null);
        setError("Configuration de réservation manquante.");
        return;
      }

      const res = await bookProspectToSlot({
        jobId,
        salespersonId: sp.salesperson_id,
        scheduledDate: dateStr,
        startTime: slot,
        allowReschedule: true,
      });
      setBookingKey(null);
      if (!res.ok) { setError(res.message); return; }
      const dayLabel = format(parseISO(dateStr), "EEEE d MMM", { locale: fr });
      onBooked(`RDV confirmé — ${dayLabel} à ${slot} avec ${sp.salesperson_name}`, jobId);
    });
  };

  return (
    <div className="space-y-3">
      {/* Navigation semaine */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => loadWeek(subWeeks(monday, 1))}
          disabled={loading || booking || !canGoPrev}
          aria-label="Semaine précédente"
          className="flex size-10 items-center justify-center rounded-lg border border-foreground/20 bg-background text-foreground shadow-sm hover:bg-muted disabled:opacity-30"
        >
          <ChevronLeft className="size-6" />
        </button>
        <span className="min-w-[220px] text-center text-base font-semibold">
          Semaine du {format(monday, "d MMM yyyy", { locale: fr })}
        </span>
        <button
          type="button"
          onClick={() => loadWeek(addWeeks(monday, 1))}
          disabled={loading || booking}
          aria-label="Semaine suivante"
          className="flex size-10 items-center justify-center rounded-lg border border-foreground/20 bg-background text-foreground shadow-sm hover:bg-muted disabled:opacity-30"
        >
          <ChevronRight className="size-6" />
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
                    <th key={day.date} className="px-2 py-2 text-center font-medium border-r last:border-r-0 min-w-[120px]">
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
                          <td key={day.date} className="px-2 py-2 border-r last:border-r-0 bg-muted/30 align-middle">
                            <div className="text-xs text-muted-foreground leading-snug line-clamp-2" title={cell.occupiedBy ?? ""}>
                              {cell.occupiedBy}
                            </div>
                          </td>
                        );
                      }

                      if (isPastYmd(day.date, todayStr)) {
                        return (
                          <td key={day.date} className="px-1 py-1 border-r last:border-r-0 h-10 bg-muted/15 align-middle text-center">
                            <span className="text-[10px] text-muted-foreground">Passé</span>
                          </td>
                        );
                      }

                      const bKey = `${sp.salesperson_id}|${day.date}|${slot}`;
                      const isBooking = booking && bookingKey === bKey;

                      return (
                        <td key={day.date} className="px-1 py-1 border-r last:border-r-0 h-12 align-middle">
                          <button
                            onClick={() => book(sp, day.date, slot)}
                            disabled={booking}
                            className="w-full h-full min-h-10 rounded flex items-center justify-center hover:bg-primary/10 transition-colors disabled:opacity-50"
                            title={cell.prevLabel ? `${cell.prevLabel} · ${formatTravelDurationLabel(cell.travelSeconds)}` : formatTravelDurationLabel(cell.travelSeconds)}
                          >
                            {isBooking ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <TravelDuration
                                seconds={cell.travelSeconds}
                                className="text-base font-semibold"
                                numberClassName="text-base font-semibold"
                              />
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
  salespersonId = null,
  excludeAppointmentId = null,
  onBooked,
}: {
  jobId: string;
  slots: ProspectSlotResult[];
  prospectLat: number;
  prospectLng: number;
  salespersonId?: string | null;
  excludeAppointmentId?: string | null;
  onBooked: (msg: string, bookedJobId?: string) => void;
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
          Par calendrier
        </button>
      </div>

      {mode === "list" && (
        <OptimizedList jobId={jobId} slots={slots} onBooked={onBooked} />
      )}
      {mode === "calendar" && (
        <Dialog open onOpenChange={(o) => { if (!o) setMode("list"); }}>
          <DialogContent className="flex h-[94vh] w-[min(1200px,calc(100%-1rem))] max-w-none flex-col gap-3 overflow-hidden p-4 sm:max-w-none">
            <DialogHeader className="shrink-0 pr-8">
              <DialogTitle>Par calendrier</DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <WeekCalendar
                jobId={jobId}
                prospectLat={prospectLat}
                prospectLng={prospectLng}
                salespersonId={salespersonId}
                excludeAppointmentId={excludeAppointmentId}
                onBooked={onBooked}
              />
            </div>
          </DialogContent>
        </Dialog>
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
  heading = "Trouver un créneau",
}: {
  job: PipelineJob;
  onClose: () => void;
  onBooked: (msg: string, bookedJobId?: string) => void;
  heading?: string;
}) {
  const [mode, setMode] = useState<OptimizerMode>("list");
  const [slots, setSlots] = useState<ProspectSlotResult[]>([]);
  const [loading, startLoad] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [listLoaded, setListLoaded] = useState(false);

  const lat = job.installation_address?.lat;
  const lng = job.installation_address?.lng;
  const noGps = !lat || !lng;

  const loadList = () => {
    if (!lat || !lng) return;
    setError(null);
    setListLoaded(true);
    startLoad(async () => {
      const res = await findBestSlotsForProspect(
        lat,
        lng,
        10,
        job.salesperson_locked ? job.salesperson_id : null,
        job.appointment_id,
        job.installation_address?.city ?? null,
      );
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
    <div className="mt-3 border rounded-xl bg-muted/5 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <p className="text-sm font-semibold flex items-center gap-1.5 min-w-0">
          <Sparkles className="size-4 text-primary shrink-0" />
          {heading}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0 p-1 rounded-md hover:bg-muted"
          aria-label="Fermer"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {noGps ? (
          <p className="text-xs text-amber-600">
            Adresse d&apos;installation non géolocalisée — modifiez le dossier pour ajouter une adresse GPS.
          </p>
        ) : (
          <>
            <div className="flex rounded-lg border overflow-hidden text-xs isolate">
              <button
                type="button"
                onClick={() => setMode("list")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 font-medium transition-colors ${mode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <Sparkles className="size-3" />
                Meilleur créneau
              </button>
              <button
                type="button"
                onClick={() => setMode("calendar")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 font-medium transition-colors border-l ${mode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
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
              <Dialog open onOpenChange={(o) => { if (!o) setMode("list"); }}>
                <DialogContent className="flex h-[94vh] w-[min(1200px,calc(100%-1rem))] max-w-none flex-col gap-3 overflow-hidden p-4 sm:max-w-none">
                  <DialogHeader className="shrink-0 pr-8">
                    <DialogTitle>{heading}</DialogTitle>
                  </DialogHeader>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <WeekCalendar
                      jobId={job.id}
                      prospectLat={lat}
                      prospectLng={lng}
                      salespersonId={job.salesperson_locked ? job.salesperson_id : null}
                      excludeAppointmentId={job.appointment_id}
                      onBooked={onBooked}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Carte d'un prospect ────────────────────────────────────────────────────────

function ProspectCard({
  job,
  salespeople,
  onBooked,
  highlighted = false,
}: {
  job: PipelineJob;
  salespeople: Salesperson[];
  onBooked: (msg: string, bookedJobId?: string) => void;
  highlighted?: boolean;
}) {
  const router = useRouter();
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  const [showReplanConfirm, setShowReplanConfirm] = useState(false);
  const [pendingDowngradeStatus, setPendingDowngradeStatus] = useState<string | null>(null);
  const [statusPending, startStatus] = useTransition();
  const [flagPending, startFlag] = useTransition();
  const client = job.clients;

  const followUp = job.follow_up_date
    ? format(new Date(job.follow_up_date + "T12:00:00"), "d MMM yyyy", { locale: fr })
    : null;

  // Badge visuel : RDV passé, statut encore « Visite planifiée »
  const isRdvPasse = isVisitOverdue(job);

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "annule") { setShowCancelModal(true); return; }
    if (newStatus === "soumission_repartie" && !job.appointment_id) {
      return;
    }
    // Si on quitte « Visite planifiée » et qu'il y a un RDV actif → confirmation
    if (
      job.status === "soumission_repartie" &&
      job.appointment_id &&
      newStatus !== "soumission_repartie"
    ) {
      setPendingDowngradeStatus(newStatus);
      setShowDowngradeConfirm(true);
      return;
    }
    startStatus(async () => {
      await updateJobStatus(job.id, newStatus);
      router.refresh();
    });
  };

  const handleDowngradeConfirm = () => {
    if (!pendingDowngradeStatus) return;
    const targetStatus = pendingDowngradeStatus;
    setShowDowngradeConfirm(false);
    setPendingDowngradeStatus(null);
    startStatus(async () => {
      await updateJobStatus(job.id, targetStatus, undefined, { cancelLinkedAppointment: true });
      router.refresh();
    });
  };

  const handleCancelConfirm = (reason: string, notes: string) => {
    startStatus(async () => {
      await updateJobStatus(job.id, "annule", { reason, notes });
      setShowCancelModal(false);
      router.refresh();
    });
  };

  const handleFlagChange = (flag: FollowUpFlag) => {
    startFlag(async () => {
      await updateJobFlag(job.id, flag);
      router.refresh();
    });
  };

  const isVisitePlanifiee = job.status === "soumission_repartie";
  const hideSlotFinder = job.status === "en_attente" && job.has_quote;
  // Afficher "Accepter" si la soumission existe et que le statut n'est pas déjà en installation
  const showAccepterBtn = job.has_quote && job.status !== "annule";

  function handleSlotFinderClick() {
    if (showOptimizer) {
      setShowOptimizer(false);
      return;
    }
    if (isVisitePlanifiee && job.appointment_id) {
      setShowReplanConfirm(true);
      return;
    }
    setShowOptimizer(true);
  }

  const metaParts = [
    job.installation_address?.city,
    client?.phone,
    job.salespeople?.name,
  ].filter(Boolean);

  return (
    <Card className={cn(
      "hover:shadow-sm transition-shadow border-l-4 bg-white",
      pipelineAccent(job.status).bar,
      highlighted && "ring-2 ring-emerald-500 shadow-md"
    )}>
      <CancelModal
        open={showCancelModal}
        pending={statusPending}
        onConfirm={handleCancelConfirm}
        onCancel={() => setShowCancelModal(false)}
      />

      {/* Confirmation de retrait de RDV lors du changement de statut */}
      {showDowngradeConfirm && (
        <Dialog open onOpenChange={(o) => { if (!o) { setShowDowngradeConfirm(false); setPendingDowngradeStatus(null); } }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Retirer le rendez-vous ?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                Ce dossier a un rendez-vous
                {job.appointment_date
                  ? ` prévu le ${format(new Date(job.appointment_date + "T12:00:00"), "d MMMM yyyy", { locale: fr })}`
                  : ""}.
              </p>
              <p className="text-muted-foreground">
                Voulez-vous annuler ce rendez-vous et libérer le créneau dans le calendrier ?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleDowngradeConfirm()}
                disabled={statusPending}
                className="flex-1 h-9 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50"
              >
                {statusPending ? "En cours…" : "Oui, retirer le RDV"}
              </button>
              <button
                onClick={() => { setShowDowngradeConfirm(false); setPendingDowngradeStatus(null); }}
                disabled={statusPending}
                className="flex-1 h-9 rounded-lg border text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
            <button
              onClick={() => { setShowDowngradeConfirm(false); setPendingDowngradeStatus(null); }}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </DialogContent>
        </Dialog>
      )}

      {showReplanConfirm && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowReplanConfirm(false); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Replanifier le rendez-vous ?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                Un rendez-vous est déjà prévu
                {job.appointment_date
                  ? ` le ${format(new Date(job.appointment_date + "T12:00:00"), "d MMMM yyyy", { locale: fr })}`
                  : ""}.
              </p>
              <p className="text-muted-foreground">
                En choisissant un nouveau créneau, le rendez-vous actuel sera supprimé.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setShowReplanConfirm(false);
                  setShowOptimizer(true);
                }}
                className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                Continuer
              </button>
              <button
                onClick={() => setShowReplanConfirm(false)}
                className="flex-1 h-9 rounded-lg border text-sm font-medium hover:bg-muted"
              >
                Annuler
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{client?.name ?? "Client sans nom"}</span>
              {job.installation_address?.lat && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                  <MapPin className="size-2.5" />GPS
                </span>
              )}
              {job.follow_up_flag && (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${flagColor(job.follow_up_flag)}`}>
                  {flagLabel(job.follow_up_flag)}
                </span>
              )}
              {isRdvPasse && job.follow_up_flag !== "rdv_passe" && (
                <span className="inline-flex items-center rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
                  RDV passé
                </span>
              )}
            </div>
            {metaParts.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{metaParts.join(" · ")}</p>
            )}
            {followUp && (
              <p className="text-xs text-amber-600 font-medium mt-0.5">Relancer : {followUp}</p>
            )}
          </div>
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0", pipelineAccent(job.status).badge)}>
            {statusLabel(job.status)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/ventes/soumission/${job.id}?from=pipeline`}
              className={cn(
                buttonVariants({ variant: job.has_quote ? "secondary" : "outline", size: "sm" }),
                "h-8 gap-1.5",
                job.has_quote
                  ? "bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100"
                  : "text-muted-foreground"
              )}
            >
              <FileText className="size-3.5" />
              {job.has_quote && job.quote_number
                ? `#${job.quote_number}`
                : job.has_quote
                  ? "Soumission"
                  : "Créer soumission"}
            </Link>
            {showAccepterBtn && (
              <Link
                href={`/ventes/soumission/${job.id}?from=pipeline&accept=1`}
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "h-8 gap-1.5 bg-green-600 hover:bg-green-700 text-white border-0"
                )}
              >
                <CheckCircle2 className="size-3.5" />
                Accepter
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {flagPending
              ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              : (
                <select
                  value={job.follow_up_flag ?? ""}
                  onChange={(e) => handleFlagChange((e.target.value || null) as FollowUpFlag)}
                  className="border-input bg-background h-8 rounded-lg border px-2 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Drapeau de suivi"
                >
                  <option value="">— Drapeau —</option>
                  <option value="a_suivre">À suivre</option>
                  <option value="a_relancer">À relancer</option>
                  <option value="rdv_passe">RDV passé</option>
                </select>
              )
            }
            {!hideSlotFinder && (
              <Button
                size="sm"
                variant={showOptimizer ? "default" : "outline"}
                onClick={handleSlotFinderClick}
                className="gap-1.5 h-8"
              >
                {showOptimizer ? <X className="size-3.5" /> : <Sparkles className="size-3.5" />}
                {showOptimizer
                  ? "Fermer"
                  : isVisitePlanifiee
                    ? "Replanifier un créneau"
                    : "Trouver créneau"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowEdit(true)}
              className="h-8 px-2"
              title="Modifier la fiche"
            >
              <Pencil className="size-3.5" />
            </Button>
          </div>
        </div>

        {job.internal_notes?.trim() && (
          <p className="text-xs text-muted-foreground border-t pt-2">
            <span className="font-semibold text-foreground">Note :</span>{" "}
            {job.internal_notes.trim()}
          </p>
        )}

        {showOptimizer && (
          <ProspectOptimizer
            job={job}
            heading={isVisitePlanifiee ? "Replanifier un créneau" : "Trouver un créneau"}
            onClose={() => setShowOptimizer(false)}
            onBooked={(msg, bookedJobId) => {
              setShowOptimizer(false);
              onBooked(msg, bookedJobId ?? job.id);
            }}
          />
        )}
      </CardContent>

      {showEdit && (
        <ProspectEditModal
          job={job}
          salespeople={salespeople}
          onClose={() => setShowEdit(false)}
          onBooked={(msg, bookedJobId) => { setShowEdit(false); onBooked(msg, bookedJobId ?? job.id); }}
        />
      )}
    </Card>
  );
}

// ── Composant principal Pipeline ───────────────────────────────────────────────

const PIPELINE_STATUSES: JobStatus[] = [
  "soumission_en_attente",
  "soumission_repartie",
  "en_attente",
];

function pipelineAccent(status: string) {
  switch (status) {
    case "soumission_en_attente":
      return {
        bar: "border-l-emerald-500",
        badge: "bg-emerald-100 text-emerald-800",
        square: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100/80",
        squareActive: "border-emerald-500 bg-emerald-100 ring-2 ring-emerald-500",
        number: "text-emerald-900",
      };
    case "soumission_repartie":
      return {
        bar: "border-l-blue-500",
        badge: "bg-blue-100 text-blue-800",
        square: "border-blue-200 bg-blue-50 hover:bg-blue-100/80",
        squareActive: "border-blue-500 bg-blue-100 ring-2 ring-blue-500",
        number: "text-blue-900",
      };
    case "en_attente":
      return {
        bar: "border-l-violet-500",
        badge: "bg-violet-100 text-violet-800",
        square: "border-violet-200 bg-violet-50 hover:bg-violet-100/80",
        squareActive: "border-violet-500 bg-violet-100 ring-2 ring-violet-500",
        number: "text-violet-900",
      };
    default:
      return {
        bar: "border-l-border",
        badge: statusColor(status),
        square: "hover:bg-muted",
        squareActive: "ring-2 ring-ring bg-accent",
        number: "",
      };
  }
}

function isVisitOverdue(job: PipelineJob, today = todayYmd()): boolean {
  return (
    job.status === "soumission_repartie" &&
    !!job.appointment_date &&
    job.appointment_date < today
  );
}

/** Passées les plus anciennes d'abord, puis les visites à venir par date. */
function compareScheduledVisits(a: PipelineJob, b: PipelineJob, today: string): number {
  const aPast = isVisitOverdue(a, today);
  const bPast = isVisitOverdue(b, today);
  if (aPast !== bPast) return aPast ? -1 : 1;
  const ad = a.appointment_date ?? "9999-99-99";
  const bd = b.appointment_date ?? "9999-99-99";
  return ad.localeCompare(bd);
}

export function PipelineClient({
  jobs,
  salespeople,
  currentSalespersonId = null,
  openJobId = null,
  highlightJobId = null,
  enAttenteTotal = 0,
}: {
  jobs: PipelineJob[];
  salespeople: Salesperson[];
  /** null = admin/secrétaire (voit tout). string = vendeur connecté (Phase 2). */
  currentSalespersonId?: string | null;
  /** Deep-link : ouvre la fiche prospect pour ce jobId (`?job=`) */
  openJobId?: string | null;
  /** Anneau + scroll sur la carte, sans ouvrir la fiche (`?highlight=`) */
  highlightJobId?: string | null;
  /** Total BD des dossiers « Va nous rappeler » (pour la plaquette et « Voir plus »). */
  enAttenteTotal?: number;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<JobStatus | "all">("all");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterFlag, setFilterFlag] = useState<FollowUpFlag | "all">("all");
  const [filterSalesperson, setFilterSalesperson] = useState<string>(
    currentSalespersonId ?? "all"
  );
  const [enAttenteExtra, setEnAttenteExtra] = useState<PipelineJob[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deepLinkJob, setDeepLinkJob] = useState<PipelineJob | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(highlightJobId);
  const highlightRef = useRef<HTMLLIElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    setHighlightId(highlightJobId);
  }, [highlightJobId]);

  useEffect(() => {
    if (!highlightId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [highlightId, jobs]);

  // Ouvrir la fiche prospect depuis ?job=
  useEffect(() => {
    if (!openJobId) {
      setDeepLinkJob(null);
      return;
    }
    const found = jobs.find((j) => j.id === openJobId) ?? null;
    setDeepLinkJob(found);
    if (!found) {
      setToast("Ce prospect n'est plus dans le pipeline (statut changé ou inaccessible).");
      const t = setTimeout(() => setToast(null), 5000);
      router.replace("/ventes/pipeline");
      return () => clearTimeout(t);
    }
  }, [openJobId, jobs, router]);

  function clearDeepLink() {
    setDeepLinkJob(null);
    router.replace("/ventes/pipeline");
  }

  const handleBooked = (msg: string, bookedJobId?: string) => {
    setToast(msg);
    setDeepLinkJob(null);
    if (bookedJobId) {
      setFilterStatus("all");
      setFilterOverdue(false);
      setFilterFlag("all");
      setSearch("");
      setHighlightId(bookedJobId);
      // Ne pas router.replace : ça navigue et affiche le skeleton (loading.tsx).
      // L'URL est mise à jour sans rechargement ; un seul refresh suffit.
      const url = `/ventes/pipeline?highlight=${bookedJobId}`;
      if (window.location.pathname + window.location.search !== url) {
        window.history.replaceState(window.history.state, "", url);
      }
    }
    router.refresh();
    setTimeout(() => setToast(null), 5000);
  };

  // Tous les jobs visibles (initiaux + pages supplémentaires chargées)
  const allJobs = useMemo(
    () => [...jobs, ...enAttenteExtra],
    [jobs, enAttenteExtra]
  );

  // Filtre de base selon le rôle (vendeur voit seulement ses dossiers)
  const roleFiltered = useMemo(
    () =>
      currentSalespersonId
        ? allJobs.filter((j) => j.salesperson_id === currentSalespersonId)
        : allJobs,
    [allJobs, currentSalespersonId]
  );

  // Filtres actifs (statut + drapeau + vendeur + recherche)
  const today = todayYmd();

  const filteredJobs = useMemo(() => {
    return roleFiltered.filter((j) => {
      if (filterOverdue && !isVisitOverdue(j, today)) return false;
      if (filterStatus !== "all" && j.status !== filterStatus) return false;
      if (filterFlag !== "all" && j.follow_up_flag !== filterFlag) return false;
      if (!currentSalespersonId && filterSalesperson !== "all" && j.salesperson_id !== filterSalesperson) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const c = j.clients;
        const ia = j.installation_address;
        return (
          c?.name?.toLowerCase().includes(q) ||
          c?.phone?.toLowerCase().includes(q) ||
          c?.email?.toLowerCase().includes(q) ||
          c?.billing_address?.toLowerCase().includes(q) ||
          c?.billing_city?.toLowerCase().includes(q) ||
          c?.billing_postal?.toLowerCase().includes(q) ||
          ia?.address_formatted?.toLowerCase().includes(q) ||
          ia?.city?.toLowerCase().includes(q) ||
          false
        );
      }
      return true;
    });
  }, [roleFiltered, filterStatus, filterOverdue, filterFlag, filterSalesperson, search, currentSalespersonId, today]);

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
        // Pour « Va nous rappeler », utiliser le total BD si aucun filtre vendeur actif
        count:
          s === "en_attente" && !currentSalespersonId && filterSalesperson === "all"
            ? enAttenteTotal
            : baseForCounts.filter((j) => j.status === s).length,
        overdue:
          s === "soumission_repartie"
            ? baseForCounts.filter((j) => isVisitOverdue(j, today)).length
            : 0,
      })),
    [baseForCounts, today, enAttenteTotal, currentSalespersonId, filterSalesperson]
  );

  // Combien de « Va nous rappeler » sont actuellement chargés côté client
  const enAttenteLoadedCount = useMemo(
    () => allJobs.filter((j) => j.status === "en_attente").length,
    [allJobs]
  );

  // Afficher « Voir plus » quand tous les en_attente ne sont pas encore chargés
  const hasMoreEnAttente =
    !search &&
    enAttenteLoadedCount < enAttenteTotal &&
    (filterStatus === "all" || filterStatus === "en_attente") &&
    !filterOverdue;

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const more = await fetchMoreEnAttente({ offset: enAttenteLoadedCount });
      setEnAttenteExtra((prev) => [...prev, ...more]);
    } finally {
      setLoadingMore(false);
    }
  };

  const showScheduledCleanupOrder =
    filterOverdue || filterStatus === "soumission_repartie";

  const listedJobs = useMemo(() => {
    const ordered = PIPELINE_STATUSES.flatMap((status) => {
      const group = filteredJobs.filter((j) => j.status === status);
      if (status === "soumission_repartie" && showScheduledCleanupOrder) {
        return [...group].sort((a, b) => compareScheduledVisits(a, b, today));
      }
      return group;
    });
    if (!highlightId) return ordered;
    const pinned = ordered.find((j) => j.id === highlightId);
    if (!pinned) return ordered;
    return [pinned, ...ordered.filter((j) => j.id !== highlightId)];
  }, [filteredJobs, showScheduledCleanupOrder, today, highlightId]);

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
          <Button onClick={() => setShowCreate(true)} className="h-[38px] gap-1.5">
            <Plus className="size-4" />
            Nouveau prospect
          </Button>
        </div>
      </div>

      {/* Dashboard — 3 carrés de statut */}
      <div className="grid grid-cols-3 gap-2.5">
        {statusCounts.map(({ status, count, overdue }) => {
          const accent = pipelineAccent(status);
          const active = filterStatus === status && !filterOverdue;
          const overdueActive = status === "soumission_repartie" && filterOverdue;
          return (
            <button
              key={status}
              type="button"
              onClick={() => {
                if (filterStatus === status && !filterOverdue) {
                  setFilterStatus("all");
                  return;
                }
                setFilterOverdue(false);
                setFilterStatus(status);
              }}
              className={cn(
                "rounded-xl border p-3.5 text-left transition-colors",
                overdueActive || active ? accent.squareActive : accent.square
              )}
            >
              <div className={cn("text-2xl font-bold tabular-nums", accent.number)}>{count}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{statusLabel(status)}</div>
              {overdue > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (filterOverdue) {
                      setFilterOverdue(false);
                      setFilterStatus("all");
                      return;
                    }
                    setFilterStatus("soumission_repartie");
                    setFilterOverdue(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (filterOverdue) {
                      setFilterOverdue(false);
                      setFilterStatus("all");
                      return;
                    }
                    setFilterStatus("soumission_repartie");
                    setFilterOverdue(true);
                  }}
                  className={cn(
                    "mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    overdueActive
                      ? "border-orange-500 bg-orange-100 text-orange-900"
                      : "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100"
                  )}
                >
                  {overdue} en retard
                </span>
              )}
            </button>
          );
        })}
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

        {/* Bouton mode rappel — filtre sur les drapeaux */}
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={filterFlag ?? "all"}
          onChange={(e) => setFilterFlag(e.target.value === "all" ? "all" : e.target.value as FollowUpFlag)}
        >
          <option value="all">Tous les drapeaux</option>
          <option value="a_suivre">À suivre</option>
          <option value="a_relancer">Mode rappel</option>
          <option value="rdv_passe">RDV passé</option>
        </select>

      </div>

      {/* Résultats */}
      {filteredJobs.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {search || filterStatus !== "all" || filterOverdue || filterSalesperson !== "all"
              ? "Aucun résultat pour ces filtres."
              : "Aucun dossier en cours. Créez un prospect avec le bouton ci-dessus."}
          </CardContent>
        </Card>
      )}

      {/* Note quand la recherche ne couvre pas tous les Va nous rappeler */}
      {search && enAttenteLoadedCount < enAttenteTotal && (
        <p className="text-xs text-muted-foreground text-center">
          Recherche sur les {enAttenteLoadedCount} premiers « Va nous rappeler » chargés sur {enAttenteTotal} au total. Chargez-en plus pour élargir la recherche.
        </p>
      )}

      <ul className="space-y-2">
        {listedJobs.map((job) => (
          <li key={job.id} ref={job.id === highlightId ? highlightRef : null}>
            <ProspectCard
              job={job}
              salespeople={salespeople}
              onBooked={handleBooked}
              highlighted={job.id === highlightId}
            />
          </li>
        ))}
      </ul>

      {/* Voir plus — Va nous rappeler */}
      {hasMoreEnAttente && (
        <div className="flex justify-center pt-1">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="gap-2 h-9"
          >
            {loadingMore
              ? <Loader2 className="size-3.5 animate-spin" />
              : null}
            Voir {Math.min(PIPELINE_PAGE_SIZE, enAttenteTotal - enAttenteLoadedCount)} dossiers de plus
            <span className="text-muted-foreground text-xs">({enAttenteLoadedCount}/{enAttenteTotal})</span>
          </Button>
        </div>
      )}

      {showCreate && (
        <QuickProspectModal
          salespeople={salespeople}
          onClose={() => { setShowCreate(false); router.refresh(); }}
          onBooked={(msg, bookedJobId) => { setShowCreate(false); handleBooked(msg, bookedJobId); }}
        />
      )}

      {deepLinkJob && (
        <ProspectEditModal
          job={deepLinkJob}
          salespeople={salespeople}
          onClose={clearDeepLink}
          onBooked={(msg, bookedJobId) => {
            handleBooked(msg, bookedJobId ?? deepLinkJob.id);
          }}
        />
      )}

      {toast && <BookingToast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
