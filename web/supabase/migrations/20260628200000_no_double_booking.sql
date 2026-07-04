-- Empêche le double-booking : un vendeur ne peut avoir qu'un seul RDV
-- par créneau (salesperson_id + date + heure).
--
-- Si deux secrétaires cliquent en même temps sur le même créneau,
-- PostgreSQL garantit que seule la première transaction réussit.
-- La seconde reçoit une erreur 23505 (unique_violation) traitée côté app.
--
-- Nettoyage préventif : en cas de doublons déjà présents en DB,
-- on garde le plus ancien (id le plus petit lexicalement).

DELETE FROM public.sales_appointments a
USING public.sales_appointments b
WHERE a.id > b.id
  AND a.salesperson_id = b.salesperson_id
  AND a.scheduled_date = b.scheduled_date
  AND a.start_time     = b.start_time;

ALTER TABLE public.sales_appointments
  ADD CONSTRAINT sales_appt_no_double_booking
  UNIQUE (salesperson_id, scheduled_date, start_time);
