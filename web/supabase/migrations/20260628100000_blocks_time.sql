-- Ajoute les plages horaires aux blocages vendeurs (pour les congés partiels).
-- start_time / end_time NULL = journée complète.

ALTER TABLE public.salesperson_blocks
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time   TIME;
