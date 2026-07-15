/** Aligne sur les enums PostgreSQL (public.*) */

export type UserRole = "admin" | "secretary" | "salesperson";

export type JobStatus =
  | "soumission_en_attente"
  | "soumission_repartie"
  | "en_attente"
  | "a_planifier"
  | "reparti"
  | "retour_a_faire"
  | "facturation"
  | "complete"
  | "termine"
  | "annule";

/** Drapeau de suivi parallèle — indépendant du statut principal */
export type FollowUpFlag = "a_suivre" | "a_relancer" | "rdv_passe" | null;

export const CANCELLATION_REASONS = [
  { value: "autre_entreprise", label: "Autre entreprise choisie" },
  { value: "prix",             label: "Prix trop élevé" },
  { value: "reporte",          label: "Projet reporté" },
  { value: "autre",            label: "Autre" },
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number]["value"];

export type ScheduleSlot = "am" | "pm" | "full_day";

export type ScheduleRowStatus = "planned" | "cancelled";

export type EstimatedDurationHours = 4 | 8;

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  active: boolean;
  color: string | null;
  notes: string | null;
  created_at: string;
}

export interface Technician {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
}

export interface TeamTechnician {
  team_id: string;
  technician_id: string;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_raw: string | null;
  address_formatted: string | null;
  city: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  installation_info: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  client_id: string;
  salesperson_id: string | null;
  appointment_id: string | null;
  installation_info: string | null;
  internal_notes: string | null;
  estimated_duration_hours: EstimatedDurationHours;
  preferred_date: string | null;
  status: JobStatus;
  follow_up_date: string | null;
  follow_up_flag: FollowUpFlag;
  cancellation_reason: string | null;
  cancellation_notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  job_id: string;
  team_id: string;
  scheduled_date: string;
  slot_type: ScheduleSlot;
  status: ScheduleRowStatus;
  created_at: string;
}

export interface AppSettings {
  id: string;
  office_address: string | null;
  office_lat: number | null;
  office_lng: number | null;
  am_start: string;
  am_end: string;
  pm_start: string;
  pm_end: string;
  full_day_threshold_hours: number;
  created_at: string;
  updated_at: string;
}

// ── Ventes ──────────────────────────────────────────────────────────────────

export type QuoteStatus = "draft" | "pending" | "accepted" | "refused";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

/** Statuts visibles dans le pipeline de VENTES */
export const SALES_STATUSES: JobStatus[] = [
  "soumission_en_attente",
  "soumission_repartie",
  "en_attente",
];

/** Statuts visibles dans le dashboard d'INSTALLATION */
export const INSTALL_STATUSES: JobStatus[] = [
  "a_planifier",
  "reparti",
  "retour_a_faire",
];

/** Statut archivé — caché par défaut, visible sur demande dans le dispatch */
export const ARCHIVED_STATUSES: JobStatus[] = ["termine", "annule", "complete", "facturation"];

/** Statuts visibles dans la liste "à planifier" (attendent un créneau) */
export const DISPATCH_STATUSES: JobStatus[] = ["a_planifier"];

export interface Salesperson {
  id: string;
  name: string;
  active: boolean;
  profile_id: string | null;
  home_address: string | null;
  home_lat: number | null;
  home_lng: number | null;
  notes: string | null;
  created_at: string;
}

export interface SalespersonDayConfig {
  id: string;
  salesperson_id: string;
  day_of_week: number;
  active: boolean;
  work_start_time: string;
  work_end_time: string;
}

export interface SalespersonBlock {
  id: string;
  salesperson_id: string;
  block_type: "vacances" | "bureau" | "autre";
  start_date: string;
  end_date: string;
  /** null = journée complète */
  start_time: string | null;
  /** null = journée complète */
  end_time: string | null;
  notes: string | null;
  created_at: string;
}

export interface TeamBlock {
  id: string;
  team_id: string;
  blocked_date: string;
  slot_type: "am" | "pm" | "full_day";
  notes: string | null;
  created_at: string;
}

export interface SalesAppointment {
  id: string;
  salesperson_id: string;
  client_name: string;
  client_phone: string | null;
  client_address: string | null;
  scheduled_date: string;
  start_time: string;
  status: AppointmentStatus;
  notes: string | null;
  quote_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Quote {
  id: string;
  quote_number: number;
  appointment_id: string | null;
  client_id: string | null;
  job_id: string | null;
  client_name: string;
  client_address: string | null;
  client_work_address: string | null;
  client_phone: string | null;
  client_cell: string | null;
  client_email: string | null;
  has_subsidy: boolean;
  will_call_back: boolean;
  montant_subvention: number | null;
  total_net: number | null;
  quote_date: string;
  inst_prepiping: boolean;
  inst_drill_concrete: boolean;
  inst_through_attic: boolean;
  inst_through_basement: boolean;
  inst_through_garage: boolean;
  inst_through_closet: boolean;
  inst_appliance_change: boolean;
  inst_through_stairs: boolean;
  electrical_amperage: string | null;
  electrical_panel: string | null;
  electrical_included: boolean;
  electrical_not_included: boolean;
  electrical_to_schedule: boolean;
  electrical_initials: string | null;
  notes: string | null;
  subtotal: number;
  deposit: number | null;
  estimated_duration_hours: 4 | 8 | null;
  salesperson_id: string | null;
  approved_by: string | null;
  signature_data: string | null;
  status: QuoteStatus;
  created_at: string;
  updated_at: string;
}

export interface QuoteUnit {
  id: string;
  quote_id: string;
  unit_order: number;
  description: string | null;
  brand: string | null;
  model: string | null;
  capacity_btu: string | null;
  heating_capacity_25: string | null;
  warranty_parts: string | null;
  warranty_months: string | null;
  evaporator: string | null;
  pipe_feet: string | null;
  cap_long1_length: string | null;
  cap_long1_color: string | null;
  cap_long2_length: string | null;
  cap_long2_color: string | null;
  support_type: string | null;
  floor_mount_type: string | null;
  difficulty: string | null;
  tech_count: number | null;
  unit_subtotal: number;
  serial_number: string | null;
}

/** Suggestion de creneau (pas d'affectation auto) */
export interface ScheduleSuggestion {
  teamId: string;
  teamName: string;
  date: string;
  slot: ScheduleSlot;
  distanceMeters: number | null;
  durationSeconds: number | null;
}
