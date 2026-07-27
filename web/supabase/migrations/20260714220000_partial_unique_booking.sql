-- Remplace la contrainte UNIQUE globale par un index partiel :
-- seuls les RDV actifs (non annulés) bloquent un créneau.
-- Les cancelled sont conservés pour l'historique sans bloquer le slot.

ALTER TABLE public.sales_appointments
  DROP CONSTRAINT IF EXISTS sales_appt_no_double_booking;

CREATE UNIQUE INDEX IF NOT EXISTS sales_appt_no_double_booking
  ON public.sales_appointments (salesperson_id, scheduled_date, start_time)
  WHERE status <> 'cancelled';
