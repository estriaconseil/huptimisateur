"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Mail, Printer } from "lucide-react";

import { createQuote, updateQuote, updateQuoteStatus, convertQuoteToInstallationJob } from "@/actions/sales";
import { SignaturePad } from "./signature-pad";
import { SketchPad } from "./sketch-pad";
import type { Quote, QuoteUnit, QuoteStatus, Salesperson } from "@/types/domain";

/** Empêche l'autofill navigateur (adresse → champs techniques). */
const noAc = { autoComplete: "off" as const };

// ── Types locaux ─────────────────────────────────────────────────────────────

type UnitState = {
  description: string;
  brand: string;
  model: string;
  capacity_btu: string;
  heating_capacity_25: string;
  warranty_parts: string;
  warranty_months: string;
  evaporator: string;
  pipe_feet: string;
  cap_long1_length: string;
  cap_long1_color: string;
  cap_long2_length: string;
  cap_long2_color: string;
  support_type: string;
  floor_mount_type: string;
  difficulty: string;
  tech_count: string;
  unit_subtotal: string;
  serial_number: string;
  /** Unité de l'Option B (page 2 du PDF). */
  is_alternative: boolean;
  /** Subvention spécifique à cette unité. */
  subsidy_amount: string;
  /** Répartir sans # série pour cette unité. */
  serial_bypass: boolean;
};

type FormState = {
  quote_number: string;
  client_name: string;
  client_address: string;
  client_phone: string;
  client_cell: string;
  client_email: string;
  has_subsidy: boolean;
  will_call_back: boolean;
  quote_date: string;
  inst_prepiping: boolean;
  inst_drill_concrete: boolean;
  inst_through_attic: boolean;
  inst_through_basement: boolean;
  inst_through_garage: boolean;
  inst_through_closet: boolean;
  inst_appliance_change: boolean;
  inst_through_stairs: boolean;
  electrical_amperage: string;
  electrical_panel: string;
  electrical_included: boolean;
  electrical_not_included: boolean;
  electrical_to_schedule: boolean;
  electrical_initials: string;
  notes: string;
  subtotal: string;
  deposit: string;
  montant_subvention: string;
  total_net: string;
  /** "" | "4" | "8" — durée travaux évaluée à la soumission */
  estimated_duration_hours: "" | "4" | "8";
  /** Niveau / tech — une fois pour toute la job, répliqués sur chaque unité */
  difficulty: string;
  tech_count: string;
  salesperson_id: string;
  approved_by: string;
  status: QuoteStatus;
};

const defaultUnit = (alt = false): UnitState => ({
  description: "", brand: "", model: "", capacity_btu: "", heating_capacity_25: "",
  warranty_parts: "", warranty_months: "", evaporator: "", pipe_feet: "",
  cap_long1_length: "", cap_long1_color: "", cap_long2_length: "", cap_long2_color: "",
  support_type: "", floor_mount_type: "", difficulty: "", tech_count: "", unit_subtotal: "0",
  serial_number: "", is_alternative: alt, subsidy_amount: "0", serial_bypass: false,
});

const toUnitState = (u: QuoteUnit): UnitState => ({
  description: u.description ?? "",
  brand: u.brand ?? "",
  model: u.model ?? "",
  capacity_btu: u.capacity_btu ?? "",
  heating_capacity_25: u.heating_capacity_25 ?? "",
  warranty_parts: u.warranty_parts ?? "",
  warranty_months: u.warranty_months ?? "",
  evaporator: u.evaporator ?? "",
  pipe_feet: u.pipe_feet ?? "",
  cap_long1_length: u.cap_long1_length ?? "",
  cap_long1_color: u.cap_long1_color ?? "",
  cap_long2_length: u.cap_long2_length ?? "",
  cap_long2_color: u.cap_long2_color ?? "",
  support_type: u.support_type ?? "",
  floor_mount_type: u.floor_mount_type ?? "",
  difficulty: u.difficulty ?? "",
  tech_count: u.tech_count?.toString() ?? "",
  unit_subtotal: u.unit_subtotal?.toString() ?? "0",
  serial_number: u.serial_number ?? "",
  is_alternative: u.is_alternative ?? false,
  subsidy_amount: u.subsidy_amount?.toString() ?? "0",
  serial_bypass: u.serial_bypass ?? false,
});

/** Place les unités DB dans les 6 slots (0-2 Option A, 3-5 Option B). */
function slotsFromUnits(existing: QuoteUnit[]): UnitState[] {
  const slots: UnitState[] = [
    defaultUnit(false),
    defaultUnit(false),
    defaultUnit(false),
    defaultUnit(true),
    defaultUnit(true),
    defaultUnit(true),
  ];
  const optionA = existing
    .filter((u) => !u.is_alternative)
    .sort((a, b) => a.unit_order - b.unit_order);
  const optionB = existing
    .filter((u) => u.is_alternative)
    .sort((a, b) => a.unit_order - b.unit_order);
  optionA.slice(0, 3).forEach((u, i) => {
    slots[i] = { ...toUnitState(u), is_alternative: false };
  });
  optionB.slice(0, 3).forEach((u, i) => {
    slots[i + 3] = { ...toUnitState(u), is_alternative: true };
  });
  return slots;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const inp =
  "border-input bg-background focus-visible:ring-ring flex h-8 w-full rounded border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1";
const lbl = "block text-xs font-medium mb-0.5 text-muted-foreground";
const sectionTitle = "font-semibold text-sm mb-3 border-b pb-1";

// ── TPS / TVQ ─────────────────────────────────────────────────────────────────

const TPS_RATE = 0.05;
const TVQ_RATE = 0.09975;

function calcTaxes(subtotal: number) {
  const tps = Math.round(subtotal * TPS_RATE * 100) / 100;
  const tvq = Math.round(subtotal * TVQ_RATE * 100) / 100;
  return { tps, tvq, total: Math.round((subtotal + tps + tvq) * 100) / 100 };
}

const fmt = (n: number) => n.toFixed(2);

// ── Statut ───────────────────────────────────────────────────────────────────

const STATUS_INFO: Record<QuoteStatus, { label: string; color: string }> = {
  draft:    { label: "Brouillon",           color: "bg-secondary text-secondary-foreground" },
  pending:  { label: "En attente",          color: "bg-yellow-100 text-yellow-800" },
  accepted: { label: "Acceptée",            color: "bg-green-100 text-green-800" },
  refused:  { label: "Refusée",             color: "bg-red-100 text-red-800" },
};

// ── Props ─────────────────────────────────────────────────────────────────────

type DefaultClient = {
  name: string;
  phone: string | null;
  email: string | null;
  /** Billing address (adresse de facturation) */
  address: string | null;
  /** Installation address (adresse du chantier) — read-only display in form */
  install_address: string | null;
  salesperson_id: string | null;
};

type Props = {
  appointmentId?: string | null;
  jobId?: string | null;
  quoteId?: string;
  initialQuote?: Quote;
  initialUnits?: QuoteUnit[];
  salespeople: Salesperson[];
  nextQuoteNumber?: number;
  defaultClient?: DefaultClient;
  /** Adresse d'installation (toujours fournie pour affichage facturation vs chantier) */
  installAddress?: string | null;
  /** true si le job lié est déjà en statut installation (a_planifier+) */
  alreadyConverted?: boolean;
};

// ── Composant ─────────────────────────────────────────────────────────────────

export function QuoteForm({
  appointmentId = null,
  jobId = null,
  quoteId,
  initialQuote,
  initialUnits,
  salespeople,
  nextQuoteNumber = 30001,
  defaultClient,
  installAddress = null,
  alreadyConverted = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showRepartirModal, setShowRepartirModal] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  /** Ignore le prochain clic de navigation interne après confirmation */
  const allowNextNav = useRef(false);

  const [signature, setSignature] = useState<string | null>(initialQuote?.signature_data ?? null);
  const [sketch, setSketch] = useState<string | null>(initialQuote?.sketch_data ?? null);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const setSignatureDirty = useCallback((v: string | null) => {
    setSignature(v);
    setIsDirty(true);
  }, []);
  const setSketchDirty = useCallback((v: string | null) => {
    setSketch(v);
    setIsDirty(true);
  }, []);

  // ── État envoi courriel ───────────────────────────────────────────────────
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(initialQuote?.client_email ?? "");
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const initialDuration =
    initialQuote?.estimated_duration_hours === 4 || initialQuote?.estimated_duration_hours === 8
      ? (String(initialQuote.estimated_duration_hours) as "4" | "8")
      : "";

  const [form, setForm] = useState<FormState>({
    quote_number: String(initialQuote?.quote_number ?? nextQuoteNumber),
    client_name: initialQuote?.client_name ?? defaultClient?.name ?? "",
    client_address: initialQuote?.client_address ?? defaultClient?.address ?? "",
    client_phone: initialQuote?.client_phone ?? defaultClient?.phone ?? "",
    client_cell: initialQuote?.client_cell ?? "",
    client_email: initialQuote?.client_email ?? defaultClient?.email ?? "",
    has_subsidy: initialQuote?.has_subsidy ?? false,
    will_call_back: initialQuote?.will_call_back ?? false,
    quote_date: initialQuote?.quote_date ?? new Date().toISOString().slice(0, 10),
    inst_prepiping: initialQuote?.inst_prepiping ?? false,
    inst_drill_concrete: initialQuote?.inst_drill_concrete ?? false,
    inst_through_attic: initialQuote?.inst_through_attic ?? false,
    inst_through_basement: initialQuote?.inst_through_basement ?? false,
    inst_through_garage: initialQuote?.inst_through_garage ?? false,
    inst_through_closet: initialQuote?.inst_through_closet ?? false,
    inst_appliance_change: initialQuote?.inst_appliance_change ?? false,
    inst_through_stairs: initialQuote?.inst_through_stairs ?? false,
    electrical_amperage: initialQuote?.electrical_amperage ?? "",
    electrical_panel: initialQuote?.electrical_panel ?? "",
    electrical_included: initialQuote?.electrical_included ?? false,
    electrical_not_included: initialQuote?.electrical_not_included ?? false,
    electrical_to_schedule: initialQuote?.electrical_to_schedule ?? false,
    electrical_initials: initialQuote?.electrical_initials ?? "",
    notes: initialQuote?.notes ?? "",
    subtotal: String(initialQuote?.subtotal ?? "0"),
    deposit: String(initialQuote?.deposit ?? ""),
    montant_subvention: String(initialQuote?.montant_subvention ?? ""),
    total_net: String(initialQuote?.total_net ?? ""),
    estimated_duration_hours: initialDuration,
    difficulty: initialUnits?.[0]?.difficulty ?? "",
    tech_count: initialUnits?.[0]?.tech_count?.toString() ?? "",
    salesperson_id: initialQuote?.salesperson_id ?? defaultClient?.salesperson_id ?? salespeople[0]?.id ?? "",
    approved_by: initialQuote?.approved_by ?? "",
    status: (initialQuote?.status as QuoteStatus) ?? "draft",
  });

  const existingUnits = initialUnits ?? [];
  // 6 slots : 0-2 = Option A, 3-5 = Option B (placés via is_alternative, pas l'index brut)
  const [units, setUnits] = useState<UnitState[]>(() => slotsFromUnits(existingUnits));

  // Sous-total = somme des nets Option A — recalculé au montage (évite un sous-total DB périmé)
  useEffect(() => {
    const principalNet = units
      .filter((u) => !u.is_alternative)
      .reduce(
        (acc, u) => acc + Math.max(0, (parseFloat(u.unit_subtotal) || 0) - (parseFloat(u.subsidy_amount) || 0)),
        0
      );
    const hasSubsidy = units.some((u) => (parseFloat(u.subsidy_amount) || 0) > 0);
    setForm((f) => ({
      ...f,
      subtotal: String(principalNet.toFixed(2)),
      has_subsidy: hasSubsidy || f.has_subsidy,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount from initial units
  }, []);

  const setF = <K extends keyof FormState>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setIsDirty(true);
      setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
    };

  const setU = (idx: number, k: keyof UnitState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
      setIsDirty(true);
      setUnits((us) => {
        const next = [...us];
        next[idx] = { ...next[idx], [k]: val };

        // Sous-total = somme des nets (total − subvention) des unités Option A
        if (k === "unit_subtotal" || k === "subsidy_amount") {
          const principalNet = next
            .filter((u) => !u.is_alternative)
            .reduce((acc, u) => acc + Math.max(0, (parseFloat(u.unit_subtotal) || 0) - (parseFloat(u.subsidy_amount) || 0)), 0);
          const hasSubsidy = next.some((u) => (parseFloat(u.subsidy_amount) || 0) > 0);
          setForm((f) => ({
            ...f,
            subtotal: String(principalNet.toFixed(2)),
            has_subsidy: hasSubsidy || f.has_subsidy,
          }));
        }
        return next;
      });
    };

  const buildPayload = useCallback(() => {
    const nonEmptyUnits = units
      .map((u, i) => ({
        ...u,
        unit_order: i + 1,
        // Forcer le groupe selon le slot (0-2 = A, 3-5 = B)
        is_alternative: i >= 3,
      }))
      .filter((u) => u.brand || u.model || u.description || parseFloat(u.unit_subtotal) > 0);

    return {
      quoteData: {
        quote_number: parseInt(form.quote_number) || nextQuoteNumber,
        client_name: form.client_name,
        client_address: form.client_address,
        client_phone: form.client_phone,
        client_cell: form.client_cell,
        client_email: form.client_email,
        has_subsidy: form.has_subsidy,
        will_call_back: form.will_call_back,
        quote_date: form.quote_date,
        inst_prepiping: form.inst_prepiping,
        inst_drill_concrete: form.inst_drill_concrete,
        inst_through_attic: form.inst_through_attic,
        inst_through_basement: form.inst_through_basement,
        inst_through_garage: form.inst_through_garage,
        inst_through_closet: form.inst_through_closet,
        inst_appliance_change: form.inst_appliance_change,
        inst_through_stairs: form.inst_through_stairs,
        electrical_amperage: form.electrical_amperage,
        electrical_panel: form.electrical_panel,
        electrical_included: form.electrical_included,
        electrical_not_included: form.electrical_not_included,
        electrical_to_schedule: form.electrical_to_schedule,
        electrical_initials: form.electrical_initials,
        notes: form.notes,
        subtotal: (() => {
          // Sous-total = somme des nets unités principales
          const principalNet = units
            .filter((u) => !u.is_alternative)
            .reduce((acc, u) => acc + Math.max(0, (parseFloat(u.unit_subtotal) || 0) - (parseFloat(u.subsidy_amount) || 0)), 0);
          return Math.round(principalNet * 100) / 100;
        })(),
        deposit: form.deposit ? parseFloat(form.deposit) : null,
        montant_subvention: null,
        total_net: (() => {
          const principalNet = units
            .filter((u) => !u.is_alternative)
            .reduce((acc, u) => acc + Math.max(0, (parseFloat(u.unit_subtotal) || 0) - (parseFloat(u.subsidy_amount) || 0)), 0);
          const sub = Math.round(principalNet * 100) / 100;
          const dep = parseFloat(form.deposit) || 0;
          const tpsAmt = Math.round(sub * TPS_RATE * 100) / 100;
          const tvqAmt = Math.round(sub * TVQ_RATE * 100) / 100;
          const tot = Math.round((sub + tpsAmt + tvqAmt) * 100) / 100;
          const net = Math.max(0, tot - dep);
          return net;
        })(),
        estimated_duration_hours:
          form.estimated_duration_hours === "4" || form.estimated_duration_hours === "8"
            ? (Number(form.estimated_duration_hours) as 4 | 8)
            : null,
        salesperson_id: form.salesperson_id,
        approved_by: form.approved_by,
        signature_data: signature,
        sketch_data: sketch,
        status: form.status,
      },
      unitInputs: nonEmptyUnits.map((u) => ({
        unit_order: u.unit_order,
        description: u.description,
        brand: u.brand,
        model: u.model,
        capacity_btu: u.capacity_btu,
        heating_capacity_25: u.heating_capacity_25,
        warranty_parts: u.warranty_parts,
        warranty_months: u.warranty_months,
        evaporator: u.evaporator,
        pipe_feet: u.pipe_feet,
        cap_long1_length: u.cap_long1_length,
        cap_long1_color: u.cap_long1_color,
        cap_long2_length: u.cap_long2_length,
        cap_long2_color: u.cap_long2_color,
        support_type: u.support_type,
        floor_mount_type: u.floor_mount_type,
        is_alternative: u.is_alternative,
        subsidy_amount: parseFloat(u.subsidy_amount) || 0,
        serial_bypass: u.serial_bypass,
        difficulty: form.difficulty,
        tech_count: form.tech_count ? parseInt(form.tech_count) : null,
        unit_subtotal: parseFloat(u.unit_subtotal) || 0,
        serial_number: u.serial_number || null,
      })),
    };
  }, [form, units, signature, sketch, nextQuoteNumber]);

  /** Champs obligatoires : courriel, tél ou cell, durée */
  const validateQuoteRequired = useCallback((): boolean => {
    setError(null);
    if (!form.client_email.trim()) {
      setError("Courriel obligatoire.");
      return false;
    }
    if (!form.client_phone.trim() && !form.client_cell.trim()) {
      setError("Téléphone ou cellulaire requis (au moins un des deux).");
      return false;
    }
    if (form.estimated_duration_hours !== "4" && form.estimated_duration_hours !== "8") {
      setError("Durée des travaux requise : Demi-journée (4 h) ou Journée complète (8 h).");
      return false;
    }
    return true;
  }, [form.client_email, form.client_phone, form.client_cell, form.estimated_duration_hours]);

  const saveQuote = useCallback(async (): Promise<{ ok: true; createdId?: string } | { ok: false; message: string }> => {
    if (!validateQuoteRequired()) return { ok: false, message: "Validation échouée" };
    const { quoteData, unitInputs } = buildPayload();
    if (quoteId) {
      const res = await updateQuote(quoteId, quoteData, unitInputs);
      if (!res.ok) return { ok: false, message: res.message };
      setIsDirty(false);
      return { ok: true };
    }
    const res = await createQuote({ appointmentId, jobId }, quoteData, unitInputs);
    if (!res.ok) return { ok: false, message: res.message };
    setIsDirty(false);
    const createdId = "id" in res ? (res.id as string) : undefined;
    return { ok: true, createdId };
  }, [appointmentId, jobId, quoteId, buildPayload, validateQuoteRequired]);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveQuote();
      if (!res.ok) {
        if (res.message !== "Validation échouée") setError(res.message);
        return;
      }
      if (!quoteId && res.createdId) {
        allowNextNav.current = true;
        if (appointmentId) {
          router.replace(`/ventes/rdv/${appointmentId}`);
        } else if (jobId) {
          router.replace(`/ventes/soumission/${jobId}`);
        }
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  };

  const handleStatusChange = (newStatus: QuoteStatus) => {
    if (!quoteId) return;
    startTransition(async () => {
      const res = await updateQuoteStatus(quoteId, newStatus);
      if (!res.ok) { setError(res.message); return; }
      setForm((f) => ({ ...f, status: newStatus }));
      setIsDirty(true);
    });
  };

  const validateRepartir = (): boolean => {
    if (!validateQuoteRequired()) return false;

    const missingSerial = units
      .map((u, i) => ({ u, i }))
      .filter(({ u }) => u.brand.trim() || u.model.trim() || parseFloat(u.unit_subtotal) > 0)
      .filter(({ u }) => !u.serial_number?.trim() && !u.serial_bypass)
      .map(({ i }) => (i < 3 ? `Option A — Unité ${i + 1}` : `Option B — Unité ${i - 2}`));

    if (missingSerial.length > 0) {
      setError(`# de série manquant : ${missingSerial.join(", ")}`);
      return false;
    }

    return true;
  };

  // ── Garde-fou : quitter avec modifications non sauvegardées ───────────────
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const onClick = (e: MouseEvent) => {
      if (allowNextNav.current) {
        allowNextNav.current = false;
        return;
      }
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const a = el.closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      if (href.startsWith("/api/")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      setLeaveHref(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isDirty]);

  const confirmLeaveWithoutSave = () => {
    if (!leaveHref) return;
    const href = leaveHref;
    setLeaveHref(null);
    setIsDirty(false);
    allowNextNav.current = true;
    router.push(href);
  };

  const confirmLeaveWithSave = () => {
    if (!leaveHref) return;
    const href = leaveHref;
    startTransition(async () => {
      const res = await saveQuote();
      if (!res.ok) {
        setLeaveHref(null);
        if (res.message !== "Validation échouée") setError(res.message);
        return;
      }
      setLeaveHref(null);
      allowNextNav.current = true;
      router.push(href);
    });
  };

  const handleRepartirClick = () => {
    if (!quoteId) return;
    if (!validateRepartir()) return;
    // Si un RDV ventes est lié, demander s'il faut l'annuler
    if (appointmentId) {
      setShowRepartirModal(true);
      return;
    }
    doRepartir(false);
  };

  const doRepartir = (cancelSalesAppointment: boolean) => {
    if (!quoteId) return;
    const duration = Number(form.estimated_duration_hours) as 4 | 8;
    setShowRepartirModal(false);
    startTransition(async () => {
      // Persister la durée avant conversion
      const { quoteData, unitInputs } = buildPayload();
      const saveRes = await updateQuote(quoteId, quoteData, unitInputs);
      if (!saveRes.ok) { setError(saveRes.message); return; }

      const res = await convertQuoteToInstallationJob(quoteId, {
        estimatedDurationHours: duration,
        cancelSalesAppointment,
      });
      if (!res.ok) { setError(res.message); return; }
      setIsDirty(false);
      allowNextNav.current = true;
      router.push(`/a-planifier?highlight=${res.jobId}`);
    });
  };

  const handleSendEmail = async () => {
    if (!jobId || !emailTo.trim()) return;
    setEmailSending(true);
    setEmailStatus(null);
    try {
      const res = await fetch(`/api/email/soumission/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTo.trim() }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setEmailStatus({ ok: true, message: `Soumission envoyée à ${emailTo.trim()}` });
        setEmailDialogOpen(false);
      } else {
        setEmailStatus({ ok: false, message: data.error ?? "Erreur lors de l'envoi" });
      }
    } catch {
      setEmailStatus({ ok: false, message: "Erreur réseau" });
    } finally {
      setEmailSending(false);
    }
  };

  const subtotal = parseFloat(form.subtotal) || 0;
  const { tps, tvq, total } = calcTaxes(subtotal);
  const depositAmt = parseFloat(form.deposit) || 0;
  // Total net = Total (avec taxes) − Dépôt
  const computedTotalNet = Math.max(0, total - depositAmt);
  // Sous-total Option B = somme des nets (comme Option A)
  const altSubtotal = units.slice(3, 6).reduce(
    (acc, u) => acc + Math.max(0, (parseFloat(u.unit_subtotal) || 0) - (parseFloat(u.subsidy_amount) || 0)),
    0
  );
  const statusInfo = STATUS_INFO[form.status];

  const [activeGroup, setActiveGroup] = useState<"a" | "b">("a");
  const [activeUnit, setActiveUnit] = useState(0); // 0-2 in current group

  return (
    <div className="space-y-6">
      {/* En-tête soumission */}
      <div className="bg-background rounded-xl border p-5 print:p-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-28">
              <Image src="/logo.jpg" alt="Huppé Réfrigération" fill className="object-contain" sizes="112px" />
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              <div className="font-semibold text-foreground">Huppé Réfrigération</div>
              <div>2710, King Est, Sherbrooke, QC J1G 5H1</div>
              <div>Tél. 819 566-8061</div>
              <div>huppe@hupperefrigeration.com</div>
            </div>
          </div>

          {/* N° soumission + statut */}
          <div className="text-right space-y-2">
            <div className="flex items-center justify-end gap-2">
              <div className="text-2xl font-bold">SOUMISSION</div>
              <button
                type="button"
                onClick={() => window.print()}
                className="print:hidden inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Imprimer"
              >
                <Printer className="size-3.5" />
                Imprimer
              </button>
            </div>
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-muted-foreground">N°</span>
              <input
                type="number"
                className="border-input bg-background h-8 w-28 rounded border px-2 text-sm text-right font-bold"
                value={form.quote_number}
                onChange={setF("quote_number")}
                title="Modifiable — utile pour saisir un # de soumission papier existant"
              />
            </div>
            <div>
              <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>
        </div>

        {/* Ligne drapeaux */}
        <div className="mt-4 flex flex-wrap gap-6 text-sm border-t pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.has_subsidy} onChange={setF("has_subsidy")} className="rounded" />
            Subvention
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.will_call_back} onChange={setF("will_call_back")} className="rounded" />
            Va nous rappeler
          </label>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">Date soumission</span>
            <input type="date" className={`${inp} w-36`} value={form.quote_date} onChange={setF("quote_date")} {...noAc} />
          </div>
        </div>
      </div>

      {/* Client */}
      <div className="bg-background rounded-xl border p-5">
        <div className="flex items-center justify-between mb-3 border-b pb-1">
          <p className="font-semibold text-sm">Informations client</p>
          {!initialQuote && defaultClient?.name && (
            <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 font-medium">
              ✓ Pré-rempli depuis le RDV — modifiable
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={lbl}>Nom <span className="text-destructive">*</span></label>
            <input className={inp} value={form.client_name} onChange={setF("client_name")} placeholder="Marie Tremblay" />
          </div>
          {/* Adresse facturation + installation */}
          {(() => {
            const install =
              installAddress ??
              defaultClient?.install_address ??
              null;
            const billing = form.client_address || "";
            const addressesDiffer = !!(
              install &&
              install.trim().toLowerCase() !== billing.trim().toLowerCase()
            );

            if (addressesDiffer) {
              return (
                <>
                  <div className="sm:col-span-2">
                    <label className={lbl}>Adresse de facturation</label>
                    <input className={inp} value={form.client_address} onChange={setF("client_address")} placeholder="123 rue King, Sherbrooke" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={lbl}>Adresse d&apos;installation</label>
                    <div className="flex items-center gap-2">
                      <input
                        className={`${inp} flex-1 bg-muted/40 text-muted-foreground cursor-default`}
                        value={install}
                        readOnly
                        tabIndex={-1}
                      />
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 whitespace-nowrap shrink-0">
                        ✓ GPS
                      </span>
                    </div>
                  </div>
                </>
              );
            }

            return (
              <div className="sm:col-span-2">
                <label className={lbl}>Adresse</label>
                <input className={inp} value={form.client_address} onChange={setF("client_address")} placeholder="123 rue King, Sherbrooke" />
                {install && (
                  <p className="mt-1.5 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-2.5 py-1.5">
                    L&apos;adresse de facturation est identique à l&apos;adresse d&apos;installation.
                  </p>
                )}
              </div>
            );
          })()}
          <div>
            <label className={lbl}>
              Téléphone <span className="text-destructive">*</span>
              <span className="font-normal text-muted-foreground"> (ou cellulaire)</span>
            </label>
            <input className={inp} type="tel" value={form.client_phone} onChange={setF("client_phone")} placeholder="819-555-1234" />
          </div>
          <div>
            <label className={lbl}>
              Cellulaire <span className="text-destructive">*</span>
              <span className="font-normal text-muted-foreground"> (ou téléphone)</span>
            </label>
            <input className={inp} type="tel" value={form.client_cell} onChange={setF("client_cell")} />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>Courriel <span className="text-destructive">*</span></label>
            <input className={inp} type="email" value={form.client_email} onChange={setF("client_email")} placeholder="marie@example.com" />
          </div>
        </div>
      </div>

      {/* Unités — 2 groupes × 3 unités */}
      <div className="bg-background rounded-xl border p-5">
        <p className={sectionTitle}>Équipements</p>

        {/* Sélecteur Option A / Option B */}
        <div className="flex gap-2 mb-4 print:hidden">
          {(["a", "b"] as const).map((grp) => {
            const offset = grp === "a" ? 0 : 3;
            const hasFilled = units.slice(offset, offset + 3).some(
              (u) => u.brand || u.model || u.description || parseFloat(u.unit_subtotal) > 0
            );
            return (
              <button
                key={grp}
                type="button"
                onClick={() => { setActiveGroup(grp); setActiveUnit(0); }}
                className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                  activeGroup === grp
                    ? grp === "a"
                      ? "bg-primary text-primary-foreground"
                      : "bg-amber-500 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {grp === "a" ? "Option A" : "Option B"}
                {hasFilled && (
                  <span className="inline-block size-1.5 rounded-full bg-current opacity-70" />
                )}
              </button>
            );
          })}
        </div>

        {/* Onglets unités dans le groupe actif */}
        {(["a", "b"] as const).map((grp) => {
          const offset = grp === "a" ? 0 : 3;
          const groupUnits = units.slice(offset, offset + 3);
          const isActive = grp === activeGroup;
          const grpLabel = grp === "a" ? "Option A" : "Option B";

          return (
            <div key={grp} className={isActive ? "" : "hidden print:block"}>
              {/* Print: entête Option B seulement si rempli */}
              {grp === "b" && groupUnits.some((u) => u.brand || u.model || u.description || parseFloat(u.unit_subtotal) > 0) && (
                <p className="hidden print:block font-bold text-sm text-amber-700 border-t pt-4 mt-6 mb-3">
                  Option B
                </p>
              )}

              {/* Onglets unité */}
              <div className="flex gap-1 mb-4 print:hidden">
                {groupUnits.map((u, subIdx) => (
                  <button
                    key={subIdx}
                    type="button"
                    onClick={() => setActiveUnit(subIdx)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive && activeUnit === subIdx
                        ? grp === "b"
                          ? "bg-amber-500 text-white"
                          : "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    Unité {subIdx + 1}
                    {(u.brand || u.model) && (
                      <span className="ml-1 inline-block size-1.5 rounded-full bg-current opacity-60" />
                    )}
                  </button>
                ))}
              </div>

              {/* Contenu de chaque unité du groupe */}
              {groupUnits.map((u, subIdx) => {
                const i = offset + subIdx; // index global
                const filled = !!(u.brand.trim() || u.model.trim() || u.description.trim() || parseFloat(u.unit_subtotal) > 0);
                const isVisible = isActive && activeUnit === subIdx;
                return (
                  <div
                    key={i}
                    className={
                      isVisible
                        ? "print:break-inside-avoid"
                        : filled
                          ? "hidden print:block print:break-inside-avoid print:mt-6 print:border-t print:pt-4"
                          : "hidden print:hidden"
                    }
                  >
                    <p className="mb-3 hidden text-sm font-semibold print:block">
                      {grpLabel} — Unité {subIdx + 1}
                      {(u.brand || u.model) && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {[u.brand, u.model].filter(Boolean).join(" — ")}
                        </span>
                      )}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="col-span-2 sm:col-span-4">
                        <label className={lbl}>Description / Emplacement</label>
                        <input className={inp} value={u.description} onChange={setU(i, "description")} placeholder="Étage principal, Salon..." {...noAc} />
                      </div>
                      <div>
                        <label className={lbl}>Marque</label>
                        <input className={inp} value={u.brand} onChange={setU(i, "brand")} placeholder="Midea, Daikin..." {...noAc} />
                      </div>
                      <div className="col-span-1 sm:col-span-3">
                        <label className={lbl}>Modèle</label>
                        <input className={inp} value={u.model} onChange={setU(i, "model")} {...noAc} />
                      </div>
                      <div>
                        <label className={lbl}>Capacité (BTU)</label>
                        <input className={inp} value={u.capacity_btu} onChange={setU(i, "capacity_btu")} placeholder="12000 BTU" {...noAc} />
                      </div>
                      <div>
                        <label className={lbl}>Cap. Chauf. -25°C</label>
                        <input className={inp} value={u.heating_capacity_25} onChange={setU(i, "heating_capacity_25")} placeholder="9600 BTU" {...noAc} />
                      </div>
                      <div>
                        <label className={lbl}>Garantie pièces</label>
                        <input className={inp} value={u.warranty_parts} onChange={setU(i, "warranty_parts")} placeholder="10 pces" {...noAc} />
                      </div>
                      <div>
                        <label className={lbl}>Garantie M-O</label>
                        <input className={inp} value={u.warranty_months} onChange={setU(i, "warranty_months")} placeholder="1 an" {...noAc} />
                      </div>
                      <div>
                        <label className={lbl}>Évaporateur</label>
                        <input className={inp} value={u.evaporator} onChange={setU(i, "evaporator")} {...noAc} />
                      </div>
                      <div>
                        <label className={lbl}>Nbre pieds tuyaux</label>
                        <input className={inp} value={u.pipe_feet} onChange={setU(i, "pipe_feet")} placeholder="50" {...noAc} />
                      </div>
                      <div>
                        <label className={lbl}>Cap Long 1 — Long</label>
                        <input className={inp} value={u.cap_long1_length} onChange={setU(i, "cap_long1_length")} placeholder="50 #" {...noAc} />
                      </div>
                      <div>
                        <label className={lbl}>Cap Long 1 — Coul.</label>
                        <input className={inp} value={u.cap_long1_color} onChange={setU(i, "cap_long1_color")} placeholder="Blanc" {...noAc} />
                      </div>
                      <div>
                        <label className={lbl}>Cap Long 2 — Long</label>
                        <input className={inp} value={u.cap_long2_length} onChange={setU(i, "cap_long2_length")} {...noAc} />
                      </div>
                      <div>
                        <label className={lbl}>Cap Long 2 — Coul.</label>
                        <input className={inp} value={u.cap_long2_color} onChange={setU(i, "cap_long2_color")} {...noAc} />
                      </div>

                      {/* Support */}
                      <div className="col-span-2 sm:col-span-4">
                        <label className={lbl}>Support</label>
                        <div className="flex flex-wrap gap-3 mt-1">
                          {["regular", "inverted", "special", "inverted_adj"].map((v) => (
                            <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                              <input type="radio" name={`support-${i}`} value={v} checked={u.support_type === v} onChange={setU(i, "support_type")} />
                              {v === "regular" ? "Régulier" : v === "inverted" ? "Inversé" : v === "special" ? "Spécial" : "Inversé ajust."}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Au sol */}
                      <div className="col-span-2 sm:col-span-4">
                        <label className={lbl}>Au sol</label>
                        <div className="flex flex-wrap gap-3 mt-1">
                          {["alum_table", "plastic_base", "diversitech"].map((v) => (
                            <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                              <input type="radio" name={`floor-${i}`} value={v} checked={u.floor_mount_type === v} onChange={setU(i, "floor_mount_type")} />
                              {v === "alum_table" ? "Table alum." : v === "plastic_base" ? "Base plast." : "Diversitech"}
                            </label>
                          ))}
                          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input type="radio" name={`floor-${i}`} value="" checked={u.floor_mount_type === ""} onChange={setU(i, "floor_mount_type")} />
                            Aucun
                          </label>
                        </div>
                      </div>

                      {/* Total + Subvention + Net + # Série */}
                      <div className="col-span-2 sm:col-span-4 pt-2 border-t mt-1 space-y-3">
                        {/* Ligne 1 : Total − Subvention = Net */}
                        <div className="flex items-end gap-2 flex-wrap">
                          <div className="flex-1 min-w-[120px]">
                            <label className="mb-1 block text-base font-bold text-primary">Total unité</label>
                            <div className="border-input bg-background focus-within:ring-ring flex h-8 w-full items-center rounded border px-2 focus-within:ring-2 focus-within:ring-offset-1">
                              <input
                                className="h-full w-full bg-transparent text-sm font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                type="number" min={0} step={0.01} value={u.unit_subtotal}
                                onChange={setU(i, "unit_subtotal")} placeholder="0.00" {...noAc}
                              />
                              <span className="ml-1 shrink-0 text-sm text-muted-foreground select-none">$</span>
                            </div>
                          </div>
                          <span className="text-muted-foreground text-sm pb-1.5 shrink-0">−</span>
                          <div className="flex-1 min-w-[120px]">
                            <label className={lbl}>Subvention</label>
                            <div className="border-input bg-background focus-within:ring-ring flex h-8 w-full items-center rounded border px-2 focus-within:ring-2 focus-within:ring-offset-1">
                              <input
                                className="h-full w-full bg-transparent text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                type="number" min={0} step={0.01} value={u.subsidy_amount}
                                onChange={setU(i, "subsidy_amount")} placeholder="0.00" {...noAc}
                              />
                              <span className="ml-1 shrink-0 text-sm text-muted-foreground select-none">$</span>
                            </div>
                          </div>
                          <span className="text-muted-foreground text-sm pb-1.5 shrink-0">=</span>
                          <div className="flex-1 min-w-[120px]">
                            <label className={lbl}>Net unité</label>
                            <div className="h-8 flex items-center rounded border border-emerald-300 bg-emerald-50 px-2">
                              <span className="text-sm font-semibold text-emerald-800 flex-1 text-right">
                                {fmt(Math.max(0, (parseFloat(u.unit_subtotal) || 0) - (parseFloat(u.subsidy_amount) || 0)))}
                              </span>
                              <span className="ml-1 text-sm text-emerald-700 shrink-0">$</span>
                            </div>
                          </div>
                        </div>
                        {/* Ligne 2 : # Série + bypass */}
                        <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                          <div className="flex-1">
                            <label className={`${lbl} flex items-center gap-1`}>
                              # Série
                              <span className="text-[10px] text-muted-foreground font-normal">(rempli par la secrétaire)</span>
                            </label>
                            <input className={inp} value={u.serial_number} onChange={setU(i, "serial_number")} placeholder="Ex: SN-123456" {...noAc} />
                          </div>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer text-muted-foreground hover:text-foreground sm:mt-5 shrink-0">
                            <input type="checkbox" checked={u.serial_bypass} onChange={setU(i, "serial_bypass")} className="rounded" />
                            Répartir sans # série
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Détails installation */}
      <div className="bg-background rounded-xl border p-5 print:break-inside-avoid">
        <p className={sectionTitle}>Autres détails d&apos;installation</p>

        <div className="mb-4">
          <label className={`${lbl} flex items-center gap-1`}>
            Durée des travaux <span className="text-destructive">*</span>
            <span className="text-[10px] text-muted-foreground font-normal">(obligatoire)</span>
          </label>
          <div className="flex flex-wrap gap-4 mt-1">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="estimated_duration_hours"
                value="4"
                checked={form.estimated_duration_hours === "4"}
                onChange={() => { markDirty(); setForm((f) => ({ ...f, estimated_duration_hours: "4" })); }}
              />
              Demi-journée (4 h)
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="estimated_duration_hours"
                value="8"
                checked={form.estimated_duration_hours === "8"}
                onChange={() => { markDirty(); setForm((f) => ({ ...f, estimated_duration_hours: "8" })); }}
              />
              Journée complète (8 h)
            </label>
          </div>
        </div>

        {/* Niveau / tech — une fois pour toute la job */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="col-span-2">
            <label className={lbl}>Niveau d&apos;installation</label>
            <div className="flex gap-4 mt-1">
              {["easy", "medium", "hard"].map((v) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="job-diff"
                    value={v}
                    checked={form.difficulty === v}
                    onChange={() => { markDirty(); setForm((f) => ({ ...f, difficulty: v })); }}
                  />
                  {v === "easy" ? "Facile" : v === "medium" ? "Moyen" : "Difficile"}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={lbl}>Techniciens</label>
            <div className="flex gap-4 mt-1">
              {["1", "2"].map((v) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="job-tech"
                    value={v}
                    checked={form.tech_count === v}
                    onChange={() => { markDirty(); setForm((f) => ({ ...f, tech_count: v })); }}
                  />
                  {v} Tech
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ["inst_prepiping", "Prépiping"],
            ["inst_drill_concrete", "Drill béton"],
            ["inst_through_attic", "Par grenier"],
            ["inst_through_basement", "Par sous-sol"],
            ["inst_through_garage", "Par garage"],
            ["inst_through_closet", "Par le garde-robe"],
            ["inst_appliance_change", "Changement appareil"],
            ["inst_through_stairs", "Ds Escalier"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form[key as keyof FormState] as boolean}
                onChange={setF(key as keyof FormState)}
                className="rounded"
              />
              {label}
            </label>
          ))}
        </div>

        <div className="mt-4">
          <label className={lbl}>Notes</label>
          <textarea
            className={`${inp} h-20 py-2 resize-none`}
            value={form.notes}
            onChange={setF("notes")}
            placeholder="Informations supplémentaires sur l'installation..."
            {...noAc}
          />
        </div>
      </div>

      {/* Informations électriques */}
      <div className="bg-background rounded-xl border p-5">
        <p className={sectionTitle}>Informations électriques</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className={lbl}>Ampérage</label>
            <input className={inp} value={form.electrical_amperage} onChange={setF("electrical_amperage")} placeholder="200A / 230V" {...noAc} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Panneau</label>
            <input className={inp} value={form.electrical_panel} onChange={setF("electrical_panel")} placeholder="Square D" {...noAc} />
          </div>
          <div className="col-span-2 sm:col-span-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.electrical_included} onChange={setF("electrical_included")} className="rounded" />
              Élect. incluse
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.electrical_not_included} onChange={setF("electrical_not_included")} className="rounded" />
              Élect. non incluse
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.electrical_to_schedule} onChange={setF("electrical_to_schedule")} className="rounded" />
              Élect. à céduler
            </label>
            <div className="flex items-center gap-2">
              <label className={`${lbl} mb-0`}>Initiales</label>
              <input className={`${inp} w-20`} value={form.electrical_initials} onChange={setF("electrical_initials")} {...noAc} />
            </div>
          </div>
        </div>
      </div>

      {/* Financiers + signature */}
      <div className="bg-background rounded-xl border p-5">
        <p className={sectionTitle}>Financiers</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Gauche : représentant + approuvé + signature */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Représentant</label>
                <select className={inp} value={form.salesperson_id} onChange={setF("salesperson_id")} {...noAc}>
                  <option value="">— choisir —</option>
                  {salespeople.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Approuvé par (client)</label>
                <input className={inp} value={form.approved_by} onChange={setF("approved_by")} {...noAc} />
              </div>
            </div>
            <div>
              <label className={lbl}>Signature client</label>
              <SignaturePad value={signature} onChange={setSignatureDirty} width={360} height={120} />
            </div>
          </div>

          {/* Droite : tableau de prix + texte légal */}
          <div>
            <div className="border rounded-lg overflow-hidden max-w-sm ml-auto w-full">
              <div className="flex justify-between px-4 py-2 bg-muted/40 text-sm">
                <span className="text-muted-foreground text-xs">Sous-total <span className="opacity-60">(nets)</span></span>
                <span className="font-medium">{fmt(parseFloat(form.subtotal) || 0)} $</span>
              </div>
              <div className="flex justify-between px-4 py-2 text-sm border-t text-muted-foreground">
                <span>TPS (5%)</span>
                <span>{fmt(tps)} $</span>
              </div>
              <div className="flex justify-between px-4 py-2 text-sm border-t text-muted-foreground">
                <span>TVQ (9.975%)</span>
                <span>{fmt(tvq)} $</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 bg-foreground text-background font-bold border-t text-base">
                <span>TOTAL</span>
                <span>{fmt(total)} $</span>
              </div>
              <div className="flex justify-between px-4 py-2 text-sm border-t">
                <span className="text-muted-foreground">− Dépôt</span>
                <div className="flex items-center gap-1">
                  <input
                    className="w-24 text-right border-0 bg-transparent text-sm outline-none"
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.deposit}
                    onChange={(e) => {
                      const val = e.target.value;
                      markDirty();
                      setForm((f) => ({ ...f, deposit: val }));
                    }}
                    placeholder="0.00"
                    {...noAc}
                  />
                  <span className="text-muted-foreground">$</span>
                </div>
              </div>
              <div className="flex justify-between px-4 py-2.5 bg-emerald-50 text-emerald-900 font-bold border-t text-base">
                <span>Total net</span>
                <span>{fmt(computedTotalNet)} $</span>
              </div>
            </div>
            <p className="mt-3 max-w-sm ml-auto text-xs text-muted-foreground leading-relaxed italic">
              En acceptant la présente soumission, le client s&apos;engage à respecter le terme de paiement à l&apos;installation.
            </p>
            {altSubtotal > 0 && (() => {
              const { tps: aTps, tvq: aTvq, total: aTotal } = calcTaxes(altSubtotal);
              return (
                <div className="mt-3 border border-amber-300 rounded-lg overflow-hidden max-w-sm ml-auto w-full">
                  <div className="flex justify-between px-4 py-2 bg-amber-50 text-amber-900 text-xs font-bold border-b border-amber-200">
                    <span>Option B</span>
                  </div>
                  <div className="flex justify-between px-4 py-2 text-sm bg-muted/20">
                    <span>Sous-total</span>
                    <span>{fmt(altSubtotal)} $</span>
                  </div>
                  <div className="flex justify-between px-4 py-2 text-sm text-muted-foreground border-t">
                    <span>TPS (5%)</span>
                    <span>{fmt(aTps)} $</span>
                  </div>
                  <div className="flex justify-between px-4 py-2 text-sm text-muted-foreground border-t">
                    <span>TVQ (9.975%)</span>
                    <span>{fmt(aTvq)} $</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 bg-amber-500 text-white font-bold border-t text-base">
                    <span>Total :</span>
                    <span>{fmt(aTotal)} $</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Croquis / plan d'installation */}
      <div className="bg-background rounded-xl border p-5 print:break-inside-avoid">
        <p className={sectionTitle}>Croquis / plan d&apos;installation</p>
        <p className="text-xs text-muted-foreground mb-3">
          Dessinez un schéma simplifié de l&apos;installation (passages de tuyaux, position des unités…). Ce dessin apparaîtra dans le PDF client.
        </p>
        <SketchPad value={sketch} onChange={setSketchDirty} />
      </div>

      {/* Dialogue envoi par courriel */}
      {emailDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-background w-full max-w-sm rounded-xl border p-5 shadow-lg space-y-4">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Mail className="size-4" />
              Envoyer la soumission par courriel
            </h3>
            <p className="text-sm text-muted-foreground">
              Un PDF de la soumission sera joint au courriel.
            </p>
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">Adresse courriel du client</label>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="border-input bg-background h-8 w-full rounded border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="client@example.com"
                autoFocus
              />
            </div>
            {emailStatus && !emailStatus.ok && (
              <p className="text-destructive text-sm">{emailStatus.message}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setEmailDialogOpen(false); setEmailStatus(null); }}
                disabled={emailSending}
                className="h-9 px-4 rounded-lg border text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={emailSending || !emailTo.trim()}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {emailSending ? (
                  <span className="inline-block size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <Mail className="size-3.5" />
                )}
                {emailSending ? "Envoi..." : "Envoyer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogue quitter avec modifications */}
      {leaveHref && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-background w-full max-w-xl rounded-xl border p-6 sm:p-7 shadow-lg space-y-5">
            <h3 className="font-semibold text-lg">Modifications non sauvegardées</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Vous avez des changements sur cette soumission. Que voulez-vous faire&nbsp;?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => setLeaveHref(null)}
                className="h-10 w-full px-3 rounded-lg border text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Rester
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmLeaveWithoutSave}
                className="h-10 w-full px-3 rounded-lg border border-destructive/30 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Quitter sans sauvegarder
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmLeaveWithSave}
                className="h-10 w-full px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? "Enregistrement..." : "Sauvegarder et quitter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {error && <p className="text-destructive text-sm rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2 print:hidden">{error}</p>}
      {saved && <p className="text-emerald-600 text-sm print:hidden">✓ Soumission sauvegardée</p>}
      {emailStatus?.ok && <p className="text-emerald-600 text-sm print:hidden">✓ {emailStatus.message}</p>}
      {isDirty && !saved && (
        <p className="text-amber-700 text-xs print:hidden">● Modifications non sauvegardées</p>
      )}

      {showRepartirModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-background w-full max-w-md rounded-xl border p-5 shadow-lg space-y-4">
            <h3 className="font-semibold text-base">Répartir vers l&apos;installation</h3>
            <p className="text-sm text-muted-foreground">
              Un rendez-vous vendeur est lié à cette fiche. Souhaitez-vous annuler ce RDV ventes
              (il ne restera plus dans le calendrier vendeurs)&nbsp;?
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                disabled={pending}
                onClick={() => setShowRepartirModal(false)}
                className="h-[38px] px-4 rounded-lg border text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => doRepartir(false)}
                className="h-[38px] px-4 rounded-lg border text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Garder le RDV
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => doRepartir(true)}
                className="h-[38px] px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                Annuler le RDV et répartir
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 pb-8 print:hidden">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="h-[38px] px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Enregistrement..." : quoteId ? "Sauvegarder" : "Créer la soumission"}
        </button>

        {/* PDF / Courriel — uniquement si la soumission existe */}
        {quoteId && jobId && (
          <>
            <a
              href={`/api/pdf/soumission/${jobId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-[38px] px-4 rounded-lg border text-sm font-medium hover:bg-muted inline-flex items-center gap-2"
            >
              <Printer className="size-3.5" />
              Aperçu PDF
            </a>
            <button
              type="button"
              onClick={() => { setEmailDialogOpen(true); setEmailStatus(null); setEmailTo(form.client_email || ""); }}
              className="h-[38px] px-4 rounded-lg border text-sm font-medium hover:bg-muted inline-flex items-center gap-2"
            >
              <Mail className="size-3.5" />
              Envoyer par courriel
            </button>
          </>
        )}

        {/* Changements de statut */}
        {quoteId && form.status === "draft" && (
          <button
            type="button"
            onClick={() => handleStatusChange("pending")}
            disabled={pending}
            className="h-[38px] px-5 rounded-lg bg-yellow-500 text-white text-sm font-medium hover:bg-yellow-600 disabled:opacity-50"
          >
            Envoyer en attente
          </button>
        )}
        {quoteId && !alreadyConverted && (
          <button
            type="button"
            onClick={handleRepartirClick}
            disabled={pending}
            className="h-[38px] px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 border-2 border-primary"
          >
            → Répartir vers l&apos;installation
          </button>
        )}
        {quoteId && alreadyConverted && (
          <span className="inline-flex items-center h-[38px] px-4 rounded-lg bg-green-50 text-green-700 text-sm font-medium border border-green-200">
            ✓ Réparti vers l&apos;installation
          </span>
        )}
      </div>
    </div>
  );
}
