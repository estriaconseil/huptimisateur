-- Distingue le vendeur « propriétaire » du dossier (assigné volontairement)
-- du vendeur du RDV calendrier (placement opportuniste).
-- Si salesperson_locked = true → suggestions de créneaux filtrées sur ce vendeur.
-- Si false → suggestions pour tous les vendeurs (même si un RDV est chez A).

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS salesperson_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.jobs.salesperson_locked IS
  'true = vendeur assigné volontairement (création/édition) → optimiser seulement chez lui ; false = placement flexible → tous les vendeurs';

-- Backfill : prospects encore non bookés avec un vendeur = ownership volontaire
UPDATE public.jobs
SET salesperson_locked = true
WHERE salesperson_id IS NOT NULL
  AND appointment_id IS NULL
  AND salesperson_locked = false;
