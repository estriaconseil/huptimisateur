-- =============================================================================
-- Migration : drapeau rdv_passe + durée d'installation sur quotes
-- Date       : 2026-07-12
-- =============================================================================

-- 1. Drapeau de suivi « RDV passé » (distinct de a_suivre / a_relancer)
-- -----------------------------------------------------------------------------
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_follow_up_flag_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_follow_up_flag_check
  CHECK (
    follow_up_flag IS NULL
    OR follow_up_flag IN ('a_suivre', 'a_relancer', 'rdv_passe')
  );

-- 2. Estimation durée travaux (évaluée à la soumission, avant répartition)
-- -----------------------------------------------------------------------------
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS estimated_duration_hours INTEGER
    CHECK (
      estimated_duration_hours IS NULL
      OR estimated_duration_hours IN (4, 8)
    );
