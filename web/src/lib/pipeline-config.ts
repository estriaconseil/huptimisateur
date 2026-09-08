/** Constantes partagées entre la page pipeline et les server actions. */

export const PIPELINE_PAGE_SIZE = 40;

export const JOB_SELECT =
  "id, status, follow_up_flag, appointment_id, salesperson_id, salesperson_locked, " +
  "installation_info, internal_notes, follow_up_date, created_at, installation_address_id, " +
  "clients ( id, name, phone, email, city, billing_address, billing_city, billing_postal ), " +
  "salespeople ( name ), " +
  "installation_addresses!installation_address_id ( lat, lng, address_formatted, city )";

export type RawPipelineRow = {
  id: string;
  status: string;
  follow_up_flag: string | null;
  appointment_id: string | null;
  salesperson_id: string | null;
  salesperson_locked: boolean | null;
  installation_info: string | null;
  internal_notes: string | null;
  follow_up_date: string | null;
  created_at: string;
  installation_address_id: string | null;
  clients: unknown;
  salespeople: unknown;
  installation_addresses: unknown;
};
