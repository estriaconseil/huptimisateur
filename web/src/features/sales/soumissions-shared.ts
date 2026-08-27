export type SoumissionRow = {
  id: string;
  quote_number: number;
  client_name: string;
  client_email: string | null;
  quote_date: string;
  status: string;
  subtotal: number;
  job_id: string | null;
  appointment_id: string | null;
  salesperson_name: string | null;
  scheduled_date: string | null;
};

/** 10 dernières par défaut (et taille de page). */
export const SOUMISSIONS_PAGE_SIZE = 10;
