-- Créneaux ventes : journée typique 09:00 → soir (~19:30)
-- Aligné sur FIXED_TIME_SLOTS côté app :
--   09:00, 10:30, 12:00, 13:30, 15:00, 16:30, 18:00

-- 1) Horaires vendeur — démarrer à 9h si encore à 8h, et ouvrir jusqu’à 19:30
--    pour rendre le créneau 18:00 réservable (slot < work_end).
UPDATE public.salesperson_day_config
SET work_start_time = '09:00'::time
WHERE active = true
  AND work_start_time = '08:00'::time;

UPDATE public.salesperson_day_config
SET work_end_time = '19:30'::time
WHERE active = true
  AND work_end_time <= '17:00'::time;

-- Note : la table salespeople n'a pas de colonnes work_start/end_time en prod —
--        les horaires par vendeur vivent uniquement dans salesperson_day_config.

-- 2) Remapper les RDV futurs des anciens créneaux fixes vers les nouveaux.
--    On ne touche PAS les RDV passés (données historiques).
--    Mapping 1:1 — pas de collision entre anciens créneaux.
UPDATE public.sales_appointments
SET start_time = CASE to_char(start_time, 'HH24:MI')
  WHEN '08:00' THEN '09:00'::time
  WHEN '09:30' THEN '10:30'::time
  WHEN '11:00' THEN '12:00'::time
  WHEN '12:30' THEN '13:30'::time
  WHEN '14:00' THEN '15:00'::time
  WHEN '15:30' THEN '16:30'::time
  ELSE start_time
END
WHERE scheduled_date >= CURRENT_DATE
  AND to_char(start_time, 'HH24:MI') IN (
    '08:00', '09:30', '11:00', '12:30', '14:00', '15:30'
  );
