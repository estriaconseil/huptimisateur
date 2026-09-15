"use client";

import { useCallback, useState, useTransition } from "react";
import { CalendarDays, Link2, Pencil, Plus, Trash2, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddressAutocomplete, type ResolvedPlace } from "@/components/maps/address-autocomplete";
import {
  createSalesperson,
  updateSalesperson,
  updateDayConfig,
  deleteSalesperson,
  forceDeleteSalesperson,
  toggleSalespersonActive,
  linkSalespersonToProfile,
  type DayConfigInput,
} from "@/actions/vendeurs";
import type { SalespersonDayConfig } from "@/types/domain";
import type { SalespersonWithDays, SalespersonProfile } from "@/app/(app)/vendeurs/page";

const DAYS = [
  { dow: 1, label: "Lundi" },
  { dow: 2, label: "Mardi" },
  { dow: 3, label: "Mercredi" },
  { dow: 4, label: "Jeudi" },
  { dow: 5, label: "Vendredi" },
  { dow: 6, label: "Samedi" },
  { dow: 7, label: "Dimanche" },
];

const inp = "border-input bg-background h-8 w-full rounded-lg border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const lbl = "block text-xs font-medium mb-0.5 text-muted-foreground";

// ── Formulaire de base vendeur ─────────────────────────────────────────────

type BaseForm = {
  name: string;
  home_address: string;
  home_lat: number | null;
  home_lng: number | null;
  notes: string;
  active: boolean;
};

function defaultBase(): BaseForm {
  return { name: "", home_address: "", home_lat: null, home_lng: null, notes: "", active: true };
}

function VendeurBaseForm({
  initial,
  onSave,
  onCancel,
  pending,
}: {
  initial: BaseForm;
  onSave: (v: BaseForm) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [form, setForm] = useState<BaseForm>(initial);

  const setField =
    (k: keyof BaseForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const onAddressResolved = useCallback((p: ResolvedPlace) => {
    setForm((f) => ({
      ...f,
      home_address: p.address_formatted || p.address_raw,
      home_lat: p.lat,
      home_lng: p.lng,
    }));
  }, []);

  return (
    <div className="grid sm:grid-cols-2 gap-3 p-4 bg-muted/20 rounded-lg border">
      <div>
        <label className={lbl}>Nom <span className="text-destructive">*</span></label>
        <input className={inp} value={form.name} onChange={setField("name")} placeholder="Jean Dupont" />
      </div>
      <div>
        <label className={lbl}>
          Adresse domicile
          {form.home_lat && <span className="ml-1 text-[10px] text-emerald-600 font-normal">✓ géolocalisée</span>}
        </label>
        <AddressAutocomplete
          value={form.home_address}
          onChange={(v) => setForm((f) => ({ ...f, home_address: v, home_lat: null, home_lng: null }))}
          onResolved={onAddressResolved}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={lbl}>Notes internes</label>
        <input className={inp} value={form.notes} onChange={setField("notes")} placeholder="Optionnel" />
      </div>
      <div className="sm:col-span-2 flex gap-2">
        <Button
          type="button"
          onClick={() => { if (form.name.trim()) onSave(form); }}
          disabled={pending || !form.name.trim()}
          className="h-[38px]"
        >
          {pending ? "Sauvegarde..." : "Sauvegarder"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="h-[38px]">
          Annuler
        </Button>
      </div>
    </div>
  );
}

// ── Éditeur d'horaires par jour ────────────────────────────────────────────

function buildDefaultDayConfigs(): DayConfigInput[] {
  return DAYS.map((d) => ({
    day_of_week: d.dow,
    active: d.dow <= 5,
    work_start_time: "08:00",
    work_end_time: "17:00",
  }));
}

function dayConfigsToInput(configs: SalespersonDayConfig[]): DayConfigInput[] {
  return DAYS.map((d) => {
    const existing = configs.find((c) => c.day_of_week === d.dow);
    return {
      day_of_week: d.dow,
      active: existing?.active ?? d.dow <= 5,
      work_start_time: existing?.work_start_time?.slice(0, 5) ?? "08:00",
      work_end_time: existing?.work_end_time?.slice(0, 5) ?? "17:00",
    };
  });
}

function DayConfigEditor({
  salespersonId,
  configs,
  onClose,
}: {
  salespersonId: string;
  configs: SalespersonDayConfig[];
  onClose: () => void;
}) {
  const [days, setDays] = useState<DayConfigInput[]>(dayConfigsToInput(configs));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const setDay = (dow: number, field: keyof DayConfigInput, value: string | boolean) =>
    setDays((prev) =>
      prev.map((d) => (d.day_of_week === dow ? { ...d, [field]: value } : d))
    );

  const handleSave = () => {
    setError(null);
    start(async () => {
      const res = await updateDayConfig(salespersonId, days);
      if (!res.ok) { setError(res.message); return; }
      onClose();
    });
  };

  return (
    <div className="mt-3 border rounded-xl p-4 bg-muted/10 space-y-3">
      <p className="text-sm font-medium">Horaires par jour</p>
      <div className="space-y-2">
        {DAYS.map((d) => {
          const cfg = days.find((c) => c.day_of_week === d.dow)!;
          return (
            <div key={d.dow} className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 w-24 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cfg.active}
                  onChange={(e) => setDay(d.dow, "active", e.target.checked)}
                  className="size-4 rounded cursor-pointer accent-primary"
                />
                <span className={`text-sm font-medium ${cfg.active ? "" : "text-muted-foreground line-through"}`}>
                  {d.label}
                </span>
              </label>
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <input
                  type="time"
                  className={`${inp} w-28 ${!cfg.active ? "opacity-40" : ""}`}
                  value={cfg.work_start_time}
                  disabled={!cfg.active}
                  onChange={(e) => setDay(d.dow, "work_start_time", e.target.value)}
                />
                <span className="text-muted-foreground text-sm">–</span>
                <input
                  type="time"
                  className={`${inp} w-28 ${!cfg.active ? "opacity-40" : ""}`}
                  value={cfg.work_end_time}
                  disabled={!cfg.active}
                  onChange={(e) => setDay(d.dow, "work_end_time", e.target.value)}
                />
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
          {pending ? "Sauvegarde..." : "Sauvegarder les horaires"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  );
}

// ── Liaison compte de connexion ────────────────────────────────────────────

function ProfileLinker({
  vendeur,
  profiles,
}: {
  vendeur: SalespersonWithDays;
  profiles: SalespersonProfile[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(vendeur.profile_id ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const linkedProfile = profiles.find((p) => p.id === vendeur.profile_id);

  const handleSave = () => {
    setError(null);
    start(async () => {
      const res = await linkSalespersonToProfile(vendeur.id, selected || null);
      if (!res.ok) { setError(res.message); return; }
      setOpen(false);
    });
  };

  const handleUnlink = () => {
    setError(null);
    start(async () => {
      const res = await linkSalespersonToProfile(vendeur.id, null);
      if (!res.ok) { setError(res.message); return; }
    });
  };

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        {linkedProfile ? (
          <>
            <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-medium">
              🔗 {linkedProfile.full_name ?? linkedProfile.email}
            </span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Changer
            </button>
            <button
              type="button"
              onClick={handleUnlink}
              disabled={pending}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Délier le compte"
            >
              <Unlink className="size-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-full px-2 py-0.5 transition-colors hover:border-foreground/40"
          >
            <Link2 className="size-3" />
            Lier un compte
          </button>
        )}
        {error && <span className="text-destructive text-xs">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">— Aucun compte lié —</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name ?? p.email} {p.email ? `(${p.email})` : ""}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" onClick={handleSave} disabled={pending} className="h-8">
        {pending ? "…" : "Appliquer"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-8">
        Annuler
      </Button>
      {error && <span className="text-destructive text-xs w-full">{error}</span>}
    </div>
  );
}

// ── Ligne vendeur ──────────────────────────────────────────────────────────

function VendeurRow({ vendeur, profiles }: { vendeur: SalespersonWithDays; profiles: SalespersonProfile[] }) {
  const [editing, setEditing] = useState(false);
  const [showDays, setShowDays] = useState(false);
  const [showForceDelete, setShowForceDelete] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = (values: BaseForm) => {
    setError(null);
    start(async () => {
      const res = await updateSalesperson(vendeur.id, {
        name: values.name,
        active: vendeur.active,
        home_address: values.home_address,
        home_lat: values.home_lat,
        home_lng: values.home_lng,
        notes: values.notes,
      });
      if (!res.ok) { setError(res.message); return; }
      setEditing(false);
    });
  };

  const handleDelete = () => {
    if (!confirm(`Supprimer le vendeur « ${vendeur.name} » ?`)) return;
    start(async () => {
      const res = await deleteSalesperson(vendeur.id);
      if (!res.ok) {
        setError(res.message);
        setShowForceDelete(true); // afficher l'option force-delete si FK bloque
      }
    });
  };

  const handleForceDelete = () => {
    if (!confirm(
      `⚠️ SUPPRESSION FORCÉE\n\nCela va effacer DÉFINITIVEMENT « ${vendeur.name} » ainsi que tous ses rendez-vous, blocs et associations.\n\nContinuer ?`
    )) return;
    setError(null);
    start(async () => {
      const res = await forceDeleteSalesperson(vendeur.id);
      if (!res.ok) setError(res.message);
    });
  };

  const handleToggle = () => {
    start(async () => {
      await toggleSalespersonActive(vendeur.id, !vendeur.active);
    });
  };

  const activeDaysCount = vendeur.salesperson_day_config.filter((d) => d.active).length;

  return (
    <div className="rounded-xl border bg-background">
      {editing ? (
        <div className="p-3 space-y-1">
          <VendeurBaseForm
            initial={{
              name: vendeur.name,
              home_address: vendeur.home_address ?? "",
              home_lat: vendeur.home_lat ?? null,
              home_lng: vendeur.home_lng ?? null,
              notes: vendeur.notes ?? "",
              active: vendeur.active,
            }}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            pending={pending}
          />
          {error && <p className="text-destructive text-xs px-1">{error}</p>}
        </div>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3">
          {/* Info principale */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{vendeur.name}</span>
              <Badge
                variant={vendeur.active ? "default" : "secondary"}
                className="text-[11px] cursor-pointer select-none hover:opacity-80 transition-opacity"
                onClick={handleToggle}
                title={vendeur.active ? "Cliquer pour désactiver" : "Cliquer pour activer"}
              >
                {pending ? "…" : vendeur.active ? "Actif" : "Inactif"}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
              {vendeur.home_address && (
                <span>📍 {vendeur.home_address}</span>
              )}
              <span>
                {activeDaysCount} jour{activeDaysCount !== 1 ? "s" : ""} / semaine
              </span>
              {vendeur.notes && <span>· {vendeur.notes}</span>}
            </div>
            {/* Liaison compte de connexion */}
            <ProfileLinker vendeur={vendeur} profiles={profiles} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
            onClick={() => setShowDays((s) => !s)}
            disabled={pending}
            className={`p-1.5 rounded-lg transition-colors ${showDays ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
            title="Gérer les horaires"
          >
            <CalendarDays className="size-4" />
          </button>
            <button
              onClick={() => setEditing(true)}
              disabled={pending}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Modifier"
            >
              <Pencil className="size-4" />
            </button>
            <button
              onClick={handleDelete}
              disabled={pending}
              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Supprimer"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      )}

      {error && !editing && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-destructive text-xs">{error}</p>
          {showForceDelete && (
            <button
              type="button"
              onClick={handleForceDelete}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="size-3" />
              Supprimer avec toutes les données (test)
            </button>
          )}
        </div>
      )}

      {showDays && (
        <div className="px-4 pb-4">
          <DayConfigEditor
            salespersonId={vendeur.id}
            configs={vendeur.salesperson_day_config}
            onClose={() => setShowDays(false)}
          />
        </div>
      )}
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────

export function VendeursManager({ vendeurs, profiles }: { vendeurs: SalespersonWithDays[]; profiles: SalespersonProfile[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [pending, start] = useTransition();
  const [addError, setAddError] = useState<string | null>(null);

  const handleAdd = (values: BaseForm) => {
    setAddError(null);
    start(async () => {
      const res = await createSalesperson({
        name: values.name,
        active: values.active,
        home_address: values.home_address,
        home_lat: values.home_lat,
        home_lng: values.home_lng,
        notes: values.notes,
      });
      if (!res.ok) { setAddError(res.message); return; }
      setShowAdd(false);
    });
  };

  const activeCount = vendeurs.filter((v) => v.active).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {vendeurs.length} vendeur{vendeurs.length !== 1 ? "s" : ""}{" · "}
          <span className="text-foreground font-medium">{activeCount} actif{activeCount !== 1 ? "s" : ""}</span>
        </p>
        <Button onClick={() => setShowAdd((s) => !s)} className="h-[38px] gap-1.5">
          <Plus className="size-4" />
          Ajouter un vendeur
        </Button>
      </div>

      {showAdd && (
        <div className="space-y-1">
          <VendeurBaseForm
            initial={defaultBase()}
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
            pending={pending}
          />
          {addError && <p className="text-destructive text-xs px-1">{addError}</p>}
        </div>
      )}

      {vendeurs.length === 0 && !showAdd && (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          <Plus className="size-8 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucun vendeur</p>
          <p className="text-sm mt-1">Ajoutez votre premier vendeur avec le bouton ci-dessus.</p>
        </div>
      )}

      {vendeurs.map((v) => (
        <VendeurRow key={v.id} vendeur={v} profiles={profiles} />
      ))}
    </div>
  );
}
