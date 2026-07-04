"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AddressAutocomplete, type ResolvedPlace } from "@/components/maps/address-autocomplete";
import { createAppointment, findNextAvailableSlot, findNextSlotAllSalespeople, type SlotSuggestion } from "@/actions/sales";
import { FIXED_TIME_SLOTS } from "./sales-utils";
import type { Salesperson } from "@/types/domain";

type Props = {
  open: boolean;
  onClose: () => void;
  salespeople: Salesperson[];
  prefill?: {
    salesperson_id: string;
    date: string;
    start_time: string;
  };
};

const inputClass =
  "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const labelClass = "block text-sm font-medium mb-1";

export function AppointmentDialog({ open, onClose, salespeople, prefill }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimizing, startOptimize] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Suggestions tous vendeurs
  const [suggestions, setSuggestions] = useState<SlotSuggestion[]>([]);
  const [optimizerMsg, setOptimizerMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    salesperson_id: prefill?.salesperson_id ?? salespeople[0]?.id ?? "",
    client_name: "",
    client_phone: "",
    client_address: "",
    client_lat: null as number | null,
    client_lng: null as number | null,
    scheduled_date: prefill?.date ?? "",
    start_time: prefill?.start_time ?? "",
    notes: "",
  });

  if (!open) return null;

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  // ── Adresse client Google (avec lat/lng) ──────────────────────────────
  const onAddressResolved = useCallback((p: ResolvedPlace) => {
    setForm((f) => ({
      ...f,
      client_address: p.address_formatted || p.address_raw,
      client_lat: p.lat,
      client_lng: p.lng,
    }));
  }, []);

  // ── Optimiseur : tous les vendeurs ─────────────────────────────────────
  const handleOptimizeAll = () => {
    setSuggestions([]);
    setOptimizerMsg(null);
    startOptimize(async () => {
      const res = await findNextSlotAllSalespeople();
      if (!res.length) {
        setOptimizerMsg("Aucun créneau libre dans les 60 prochains jours.");
        return;
      }
      setSuggestions(res);
    });
  };

  // ── Optimiseur : vendeur sélectionné ──────────────────────────────────
  const handleOptimizeSingle = () => {
    if (!form.salesperson_id) return;
    setSuggestions([]);
    setOptimizerMsg(null);
    startOptimize(async () => {
      const res = await findNextAvailableSlot(form.salesperson_id);
      if (!res) {
        setOptimizerMsg("Aucun créneau libre dans les 60 prochains jours.");
        return;
      }
      setForm((f) => ({ ...f, scheduled_date: res.date, start_time: res.start_time }));
      setOptimizerMsg(`✓ Prochain créneau : ${res.dateFormatted} à ${res.start_time}`);
    });
  };

  const selectSuggestion = (s: SlotSuggestion) => {
    setForm((f) => ({
      ...f,
      salesperson_id: s.salesperson_id,
      scheduled_date: s.date,
      start_time: s.start_time,
    }));
    setSuggestions([]);
    setOptimizerMsg(`✓ ${s.salesperson_name} — ${s.dateFormatted} à ${s.start_time}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name.trim()) { setError("Le nom du client est requis."); return; }
    if (!form.salesperson_id) { setError("Choisissez un vendeur."); return; }
    if (!form.scheduled_date || !form.start_time) { setError("La date et l'heure sont requises."); return; }
    setError(null);
    startTransition(async () => {
      const res = await createAppointment(form);
      if (!res.ok) { setError(res.message); return; }
      onClose();
      router.push(`/ventes/rdv/${res.id}`);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Nouveau rendez-vous</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Section client ── */}
          <div className="rounded-lg border bg-muted/10 p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</p>
            <div>
              <label className={labelClass}>
                Nom <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                className={inputClass}
                value={form.client_name}
                onChange={set("client_name")}
                placeholder="Marie Tremblay"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Téléphone</label>
                <input
                  type="tel"
                  className={inputClass}
                  value={form.client_phone}
                  onChange={set("client_phone")}
                  placeholder="819-555-1234"
                />
              </div>
              <div>
                {/* placeholder vide pour aligner la grille */}
              </div>
            </div>
            <div>
              <label className={labelClass}>Adresse du client (Google)</label>
              <AddressAutocomplete
                value={form.client_address}
                onChange={(v) => setForm((f) => ({ ...f, client_address: v }))}
                onResolved={onAddressResolved}
              />
            </div>
          </div>

          {/* ── Section horaire ── */}
          <div className="rounded-lg border bg-muted/10 p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Horaire</p>

            {/* Optimiseur tous vendeurs */}
            <button
              type="button"
              onClick={handleOptimizeAll}
              disabled={optimizing}
              className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline disabled:opacity-50"
            >
              <Sparkles className="size-4" />
              {optimizing ? "Recherche en cours…" : "Trouver le prochain créneau (tous les vendeurs)"}
            </button>

            {/* Suggestions multi-vendeurs */}
            {suggestions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Cliquez pour sélectionner :</p>
                {suggestions.map((s) => (
                  <button
                    key={`${s.salesperson_id}-${s.date}-${s.start_time}`}
                    type="button"
                    onClick={() => selectSuggestion(s)}
                    className="w-full text-left flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <span className="font-medium">{s.salesperson_name}</span>
                    <span className="text-muted-foreground">{s.dateFormatted} · {s.start_time}</span>
                  </button>
                ))}
              </div>
            )}

            {optimizerMsg && (
              <p className="text-xs text-emerald-600">{optimizerMsg}</p>
            )}

            {/* Vendeur + date/heure */}
            <div>
              <label className={labelClass}>Vendeur</label>
              <select
                className={inputClass}
                value={form.salesperson_id}
                onChange={set("salesperson_id")}
              >
                {salespeople.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
              {form.salesperson_id && (
                <button
                  type="button"
                  onClick={handleOptimizeSingle}
                  disabled={optimizing}
                  className="mt-1 text-xs text-muted-foreground hover:text-primary hover:underline disabled:opacity-50"
                >
                  Prochain créneau pour ce vendeur →
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.scheduled_date}
                  onChange={set("scheduled_date")}
                />
              </div>
              <div>
                <label className={labelClass}>Heure</label>
                <select
                  className={inputClass}
                  value={form.start_time}
                  onChange={set("start_time")}
                >
                  <option value="">— choisir —</option>
                  {FIXED_TIME_SLOTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              className={`${inputClass} h-20 py-2 resize-none`}
              value={form.notes}
              onChange={set("notes")}
              placeholder="Informations supplémentaires..."
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={pending} className="flex-1 h-[38px]">
              {pending ? "Création..." : "Créer le rendez-vous"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="h-[38px]">
              Annuler
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
