/** Utilitaires purs pour le module ventes — utilisables côté client ET serveur. */

import { addMinutes, format, parse } from "date-fns";

/** Créneaux fixes par défaut : 08:00, 09:30, 11:00, 12:30, 14:00, 15:30 */
export const FIXED_TIME_SLOTS = ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30"];

/** Durée fixe d'un rendez-vous vente : 1h30 (déplacement inclus) */
export const APPOINTMENT_DURATION_MINUTES = 90;

/** Génère les créneaux horaires pour un vendeur (intervalles de 90 min) */
export function getTimeSlotsForSalesperson(
  workStart: string,
  workEnd: string
): string[] {
  const slots: string[] = [];
  const base = new Date(2000, 0, 1);
  let current = parse(workStart, "HH:mm", base);
  const end = parse(workEnd, "HH:mm", base);
  while (current < end) {
    slots.push(format(current, "HH:mm"));
    current = addMinutes(current, APPOINTMENT_DURATION_MINUTES);
  }
  return slots;
}

export type AppointmentRow = {
  id: string;
  salesperson_id: string;
  client_id: string;
  /** Infos client via JOIN (chargées dans loadSalesPageData) */
  client_name: string;
  client_phone: string | null;
  client_address: string | null;
  /** Ville chantier (prioritaire) ou ville client. */
  client_city: string | null;
  client_lat: number | null;
  client_lng: number | null;
  scheduled_date: string;
  start_time: string;
  status: string;
  notes: string | null;
  quote_id: string | null;
  /**
   * Ownership volontaire du dossier lié (jobs.salesperson_locked).
   * false → déplacer / optimiser parmi tous les vendeurs.
   */
  salesperson_locked: boolean;
  /**
   * true si la soumission liée contient des unités sans # série (sans bypass activé).
   * Affiché visuellement dans le calendrier.
   */
  missing_serial: boolean;
};

export type BlockRow = {
  id: string;
  salesperson_id: string;
  block_type: "vacances" | "bureau" | "autre";
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
};

/** Vérifie si un créneau vendeur est bloqué. */
export function isSalespersonSlotBlocked(
  blocks: Pick<BlockRow, "salesperson_id" | "start_date" | "end_date" | "start_time" | "end_time">[],
  spId: string,
  date: string,
  slot: string
): boolean {
  for (const b of blocks) {
    if (b.salesperson_id !== spId) continue;
    if (date < b.start_date || date > b.end_date) continue;
    if (!b.start_time || !b.end_time) return true;
    const start = b.start_time.slice(0, 5);
    const end = b.end_time.slice(0, 5);
    if (slot >= start && slot < end) return true;
  }
  return false;
}

import type { Salesperson, SalespersonDayConfig } from "@/types/domain";

export type SalespersonForCalendar = Salesperson & {
  salesperson_day_config: Pick<SalespersonDayConfig, "day_of_week" | "active" | "work_start_time" | "work_end_time">[];
};

export type SalesPageData = {
  salespeople: SalespersonForCalendar[];
  appointments: AppointmentRow[];
  blocks: BlockRow[];
  weekDates: string[];
};
