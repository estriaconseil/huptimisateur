/** Aligné sur les enums PostgreSQL (public.*) */

export type UserRole = "admin" | "secretary";

export type JobStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type ScheduleSlot = "am" | "pm" | "full_day";

export type ScheduleRowStatus = "planned" | "cancelled";

export type EstimatedDurationHours = 4 | 6 | 8;

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
  installation_info: string | null;
  internal_notes: string | null;
  estimated_duration_hours: EstimatedDurationHours;
  preferred_date: string | null;
  status: JobStatus;
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

/** Suggestion de créneau (pas d’affectation auto) */
export interface ScheduleSuggestion {
  teamId: string;
  teamName: string;
  date: string;
  slot: ScheduleSlot;
  distanceMeters: number | null;
  durationSeconds: number | null;
}
