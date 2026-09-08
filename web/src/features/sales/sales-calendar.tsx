"use client";

import React, { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addWeeks, format, getISODay, parse, parseISO, startOfWeek } from "date-fns";
import { defaultBusinessWeekMonday } from "@/lib/dispatch/business-week";
import { fr } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, FileText, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";

import { searchSalesAppointments, type SalesAppointmentSearchHit } from "@/actions/sales";
import { cityFromAddress } from "@/lib/address";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SlotActionModal } from "./slot-action-modal";
import { AppointmentActionModal } from "./appointment-action-modal";
import { QuickProspectModal } from "./pipeline-client";
import { FIXED_TIME_SLOTS, APPOINTMENT_DURATION_MINUTES } from "./sales-utils";
import type { SalesPageData, AppointmentRow, BlockRow } from "./sales-utils";
import { deleteSalespersonBlock } from "@/actions/blocks";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-50 border-blue-300 text-blue-800",
  completed:  "bg-green-50 border-green-300 text-green-800",
  no_show:    "bg-red-50 border-red-300 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Prévu",
  completed: "Complété",
  no_show:   "Absent",
};

const BLOCK_COLORS: Record<string, string> = {
  vacances: "bg-orange-50 text-orange-700",
  bureau:   "bg-purple-50 text-purple-700",
  autre:    "bg-muted/50 text-muted-foreground",
};

const BLOCK_LABELS: Record<string, string> = {
  vacances: "Vacances",
  bureau:   "Bureau",
  autre:    "Absent",
};

function slotKey(date: string, time: string, spId: string) {
  return `${date}|${time}|${spId}`;
}

/** Vérifie si un bloc couvre un créneau donné */
function isBlockedSlot(blocks: BlockRow[], spId: string, date: string, slot: string): BlockRow | null {
  for (const b of blocks) {
    if (b.salesperson_id !== spId) continue;
    if (date < b.start_date || date > b.end_date) continue;
    // Journée complète
    if (!b.start_time || !b.end_time) return b;
    // Plage horaire
    if (slot >= b.start_time.slice(0, 5) && slot < b.end_time.slice(0, 5)) return b;
  }
  return null;
}

type PendingSlot = { salesperson_id: string; salesperson_name: string; date: string; start_time: string } | null;

const AUTO_REFRESH_MS = 2 * 60 * 1000;

type Props = {
  data: SalesPageData;
  weekStartLabel: string;
  highlightAppointmentId?: string | null;
};

export function SalesCalendar({ data, weekStartLabel, highlightAppointmentId }: Props) {
  const router = useRouter();
  const [dialogSlot, setDialogSlot] = useState<PendingSlot>(null);
  const [activeAppt, setActiveAppt] = useState<AppointmentRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [blockToDelete, setBlockToDelete] = useState<BlockRow | null>(null);
  const [blockDeleteError, setBlockDeleteError] = useState<string | null>(null);
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [refreshTimeLabel, setRefreshTimeLabel] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SalesAppointmentSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(highlightAppointmentId ?? null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anyModalOpen =
    dialogSlot !== null || activeAppt !== null || showCreate || blockToDelete !== null;

  useEffect(() => {
    setHighlightId(highlightAppointmentId ?? null);
  }, [highlightAppointmentId]);

  useEffect(() => {
    setRefreshTimeLabel(format(new Date(), "HH:mm"));
  }, []);

  const navigateToMonday = useCallback(
    (mondayDate: Date) => {
      const iso = format(startOfWeek(mondayDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
      router.push(`/ventes?week=${encodeURIComponent(iso)}`);
    },
    [router],
  );

  const shiftWeek = useCallback(
    (delta: number) => {
      navigateToMonday(addWeeks(parseISO(weekStartLabel), delta));
    },
    [weekStartLabel, navigateToMonday],
  );

  useEffect(() => {
    if (anyModalOpen) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setRefreshing(true);
      router.refresh();
      setRefreshTimeLabel(format(new Date(), "HH:mm"));
      setTimeout(() => setRefreshing(false), 800);
    }, AUTO_REFRESH_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [anyModalOpen, router]);

  useEffect(() => {
    const q = search.trim();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(() => {
      void searchSalesAppointments(q).then((res) => {
        setSearchLoading(false);
        if (res.ok) setSearchResults(res.results);
        else setSearchResults([]);
      });
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);

  const handleSearchSelect = (hit: SalesAppointmentSearchHit) => {
    setSearch("");
    setSearchResults([]);
    setHighlightId(hit.id);
    const weekMonday = format(
      startOfWeek(parseISO(hit.scheduled_date), { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );
    router.push(
      `/ventes?week=${encodeURIComponent(weekMonday)}&highlight=${encodeURIComponent(hit.id)}`,
    );
  };

  const { salespeople, appointments, blocks, weekDates } = data;

  // Index des rendez-vous par créneau
  const apptBySlot = new Map<string, AppointmentRow>();
  for (const a of appointments) {
    apptBySlot.set(slotKey(a.scheduled_date, a.start_time, a.salesperson_id), a);
  }

  const prevWeek = () => shiftWeek(-1);
  const nextWeek = () => shiftWeek(1);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Rechercher client, ville, téléphone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {searchLoading && (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {!searchLoading && search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSearchResults([]);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Effacer la recherche"
            >
              <X className="size-4" />
            </button>
          )}
          {searchResults.length > 0 && (
            <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-background shadow-lg">
              {searchResults.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  onClick={() => handleSearchSelect(hit)}
                  className="flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/60"
                >
                  <span className="font-medium">{hit.client_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(hit.scheduled_date), "EEE d MMM yyyy", { locale: fr })} ·{" "}
                    {hit.start_time} · {hit.salesperson_name}
                    {hit.client_city ? ` · ${hit.client_city}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          {search.trim().length >= 2 && !searchLoading && searchResults.length === 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground shadow-lg">
              Aucun rendez-vous trouvé (4 dernières semaines + futur).
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Semaine précédente">
            <ChevronLeft className="size-5" />
          </button>
          <span className="text-sm font-semibold min-w-52 text-center">
            Semaine du {format(parseISO(weekDates[0]), "d MMMM yyyy", { locale: fr })}
          </span>
          <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Semaine suivante">
            <ChevronRight className="size-5" />
          </button>

          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />

          {/* Input date caché — ouvert par le bouton calendrier */}
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
          <button
            onClick={() => {
              const el = dateInputRef.current;
              if (!el) return;
              typeof el.showPicker === "function" ? el.showPicker() : el.click();
            }}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            title="Aller à une date"
            aria-label="Choisir une date"
          >
            <CalendarDays className="size-4" />
          </button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigateToMonday(defaultBusinessWeekMonday())}
          >
            Cette semaine
          </Button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              setRefreshing(true);
              router.refresh();
              setRefreshTimeLabel(format(new Date(), "HH:mm"));
              setTimeout(() => setRefreshing(false), 800);
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            title="Rafraîchir maintenant"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            {refreshTimeLabel && (
              <span className="hidden sm:inline">{refreshTimeLabel}</span>
            )}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" />
            Nouveau prospect
          </button>
        </div>
        </div>
      </div>

      {salespeople.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Aucun vendeur actif. Allez dans <strong>Équipes → Vendeurs</strong> pour en ajouter.
        </div>
      )}

      {salespeople.length > 0 && (
        <div className="max-h-[calc(100dvh-11rem)] overflow-auto rounded-xl border bg-background shadow-sm">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="sticky top-0 left-0 z-30 px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-32 border-b border-r bg-muted shadow-[1px_1px_0_0_hsl(var(--border))]">
                  Vendeur / Heure
                </th>
                {weekDates.map((date, i) => (
                  <th
                    key={date}
                    className="sticky top-0 z-20 px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground border-b border-r last:border-r-0 min-w-[140px] bg-muted shadow-[0_1px_0_0_hsl(var(--border))]"
                  >
                    <div className="text-muted-foreground/70">{DAY_NAMES[i]}</div>
                    <div className="text-foreground font-bold">
                      {format(parseISO(date), "d MMM", { locale: fr })}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salespeople.map((sp, spIdx) => {
                const base = new Date(2000, 0, 1);

                return (
                  <React.Fragment key={sp.id}>
                    {/* Séparateur + nom vendeur — sticky sous l'en-tête des jours */}
                    <tr className={cn("border-b", spIdx > 0 && "border-t-2 border-t-border")}>
                      <td
                        colSpan={weekDates.length + 1}
                        className={cn(
                          "sticky top-[3.25rem] z-10 px-3 py-1.5 text-xs font-semibold shadow-[0_1px_0_0_hsl(var(--border))]",
                          sp.active ? "bg-muted text-foreground" : "bg-orange-50 text-orange-800"
                        )}
                      >
                        {sp.name}
                        {!sp.active && (
                          <span className="ml-2 font-medium text-orange-600 bg-orange-100 rounded-full px-2 py-0.5 text-[10px]">
                            Inactif — RDV existants
                          </span>
                        )}
                        {sp.active && (
                          <span className="ml-2 font-normal text-muted-foreground">
                            {FIXED_TIME_SLOTS.length} créneaux · {APPOINTMENT_DURATION_MINUTES} min
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Lignes créneaux */}
                    {FIXED_TIME_SLOTS.map((slot) => (
                      <tr
                        key={`${sp.id}-${slot}`}
                        className="border-b last:border-b-0 hover:bg-muted/10"
                      >
                        <td className="sticky left-0 z-[5] px-3 py-1 text-xs text-muted-foreground border-r whitespace-nowrap bg-background shadow-[1px_0_0_0_hsl(var(--border))]">
                          <div className="flex items-center gap-1">
                            <Clock className="size-3 opacity-50" />
                            {slot}
                          </div>
                        </td>
                        {weekDates.map((date) => {
                          const dow = getISODay(parseISO(date)); // 1=Lun…7=Dim
                          const dayConfig = sp.salesperson_day_config.find((c) => c.day_of_week === dow);
                          const dayOff = dayConfig ? !dayConfig.active : false;

                          // Vérifier si le créneau est dans les heures de travail
                          const slotTime = parse(slot, "HH:mm", base);
                          const startTime = dayConfig
                            ? parse(dayConfig.work_start_time.slice(0, 5), "HH:mm", base)
                            : parse("08:00", "HH:mm", base);
                          const endTime = dayConfig
                            ? parse(dayConfig.work_end_time.slice(0, 5), "HH:mm", base)
                            : parse("17:00", "HH:mm", base);
                          const outsideHours = slotTime < startTime || slotTime >= endTime;

                          const appt = apptBySlot.get(slotKey(date, slot, sp.id));
                          const block = !appt ? isBlockedSlot(blocks, sp.id, date, slot) : null;

                          if (dayOff) {
                            return (
                              <td key={date} className="px-2 py-1 border-r last:border-r-0 h-14 bg-muted/30 align-middle text-center">
                                <span className="text-[10px] text-muted-foreground">Congé</span>
                              </td>
                            );
                          }

                          if (outsideHours) {
                            return (
                              <td key={date} className="px-2 py-1 border-r last:border-r-0 h-14 bg-muted/10 align-middle" />
                            );
                          }

                          // Créneau bloqué
                          if (block) {
                            return (
                              <td key={date} className={cn("px-2 py-1 border-r last:border-r-0 h-14 align-middle text-center cursor-pointer", BLOCK_COLORS[block.block_type])}>
                                <button
                                  type="button"
                                  className="w-full h-full text-center"
                                  title="Cliquer pour retirer le blocage"
                                  onClick={() => {
                                    setBlockDeleteError(null);
                                    setBlockToDelete(block);
                                  }}
                                >
                                  <div className="text-[10px] font-medium">{BLOCK_LABELS[block.block_type]}</div>
                                  {block.notes && <div className="text-[9px] opacity-70 truncate">{block.notes}</div>}
                                </button>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={date}
                              className={cn(
                                "px-2 py-1 border-r last:border-r-0 h-14 align-top",
                                !sp.active && !appt && "bg-muted/20"
                              )}
                            >
                              {appt ? (
                                <button
                                  onClick={() => setActiveAppt(appt)}
                                  className={cn(
                                    "w-full h-full text-left rounded-md border px-2 py-1 text-xs leading-tight transition-opacity hover:opacity-80 overflow-hidden",
                                    highlightId === appt.id && "ring-2 ring-primary ring-offset-1",
                                    appt.quote_id
                                      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                                      : (STATUS_COLORS[appt.status] ?? "bg-muted border-border")
                                  )}
                                >
                                  <div className="font-semibold truncate flex items-center gap-1">
                                    <span className="truncate">{appt.client_name}</span>
                                    {appt.quote_id && (
                                      <span title="Soumission commencée">
                                        <FileText className="shrink-0 size-3 opacity-70" />
                                      </span>
                                    )}
                                  </div>
                                  <div className="opacity-70 truncate">
                                    {appt.client_city ?? cityFromAddress(appt.client_address) ?? "—"}
                                  </div>
                                </button>
                              ) : !sp.active ? null : (
                                <button
                                  onClick={() => setDialogSlot({ salesperson_id: sp.id, salesperson_name: sp.name, date, start_time: slot })}
                                  className="w-full h-full flex items-center justify-center rounded-md text-muted-foreground/30 hover:bg-muted/50 hover:text-muted-foreground transition-colors"
                                  aria-label="Ajouter un rendez-vous"
                                >
                                  <Plus className="size-3.5" />
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Légende */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={cn("inline-block size-2.5 rounded-sm border", STATUS_COLORS[k])} />
            {v}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-emerald-50 border border-emerald-300" />
          Soumission commencée
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-orange-100 border border-orange-300" />
          Vacances / Absent
        </div>
      </div>

      {dialogSlot && (
        <SlotActionModal
          open
          onClose={() => setDialogSlot(null)}
          slot={dialogSlot}
          salespeople={salespeople}
        />
      )}

      {activeAppt && (
        <AppointmentActionModal
          open
          onClose={() => setActiveAppt(null)}
          appointment={activeAppt}
          salespeople={salespeople}
        />
      )}

      {showCreate && (
        <QuickProspectModal
          salespeople={salespeople}
          onClose={() => { setShowCreate(false); router.refresh(); }}
          onBooked={() => { setShowCreate(false); router.refresh(); }}
        />
      )}

      <Dialog
        open={!!blockToDelete}
        onOpenChange={(o) => {
          if (!o) {
            setBlockToDelete(null);
            setBlockDeleteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Retirer le blocage ?</DialogTitle>
            <DialogDescription>
              {blockToDelete
                ? [
                    BLOCK_LABELS[blockToDelete.block_type] ?? "Blocage",
                    blockToDelete.notes ? `— ${blockToDelete.notes}` : null,
                    `(${blockToDelete.start_date}${
                      blockToDelete.end_date !== blockToDelete.start_date
                        ? ` → ${blockToDelete.end_date}`
                        : ""
                    })`,
                  ]
                    .filter(Boolean)
                    .join(" ")
                : ""}
            </DialogDescription>
          </DialogHeader>
          {blockDeleteError && (
            <p className="text-destructive text-sm">{blockDeleteError}</p>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pendingDelete}
              onClick={() => setBlockToDelete(null)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pendingDelete}
              onClick={() => {
                if (!blockToDelete) return;
                setBlockDeleteError(null);
                startDeleteTransition(async () => {
                  const res = await deleteSalespersonBlock(blockToDelete.id);
                  if (!res.ok) {
                    setBlockDeleteError(res.message);
                    return;
                  }
                  setBlockToDelete(null);
                  router.refresh();
                });
              }}
            >
              {pendingDelete ? "…" : "Retirer le blocage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
