-- Migration : supprimer le statut "facturation" de l'enum job_status
-- Stratégie : colonne TEXT temporaire pour contourner la limitation de DEFAULT sur enum.

-- 1. Migrer les données existantes (facturation → termine)
UPDATE public.jobs
SET status = 'termine'
WHERE status::text = 'facturation';

-- 2. Ajouter une colonne TEXT temporaire qui reçoit les valeurs actuelles
ALTER TABLE public.jobs ADD COLUMN status_new TEXT;
UPDATE public.jobs SET status_new = status::text;
ALTER TABLE public.jobs ALTER COLUMN status_new SET NOT NULL;

-- 3. Supprimer la contrainte DEFAULT et la colonne status originale
ALTER TABLE public.jobs ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.jobs DROP COLUMN status;

-- 4. Recréer l'enum sans "facturation"
DROP TYPE IF EXISTS public.job_status_old;
ALTER TYPE public.job_status RENAME TO job_status_old;

CREATE TYPE public.job_status AS ENUM (
  'soumission_en_attente',
  'soumission_repartie',
  'en_attente',
  'a_planifier',
  'reparti',
  'retour_a_faire',
  'complete',
  'termine',
  'annule'
);

-- 5. Ajouter la colonne status avec le nouveau type
ALTER TABLE public.jobs
  ADD COLUMN status public.job_status NOT NULL DEFAULT 'soumission_en_attente'::public.job_status;

-- 6. Copier les valeurs depuis la colonne temporaire
UPDATE public.jobs SET status = status_new::public.job_status;

-- 7. Nettoyer
ALTER TABLE public.jobs DROP COLUMN status_new;
DROP TYPE public.job_status_old;

-- 8. Recréer l'index sur status (si existant)
CREATE INDEX IF NOT EXISTS jobs_status_idx ON public.jobs (status);
