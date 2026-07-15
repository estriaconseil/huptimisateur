-- =============================================================================
-- Migration : Révision du cycle de statuts
-- Date       : 2026-07-05
-- IMPORTANT  : Les ALTER TYPE ... ADD VALUE doivent être exécutés hors
--              transaction (Supabase SQL Editor les accepte directement).
-- =============================================================================

-- 1. Nouveaux statuts dans l'enum job_status
-- -----------------------------------------------------------------------------
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'soumission_repartie' AFTER 'soumission_en_attente';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'retour_a_faire'      AFTER 'reparti';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'termine'             AFTER 'complete';

-- 2. Drapeau de suivi parallèle (n'affecte pas le statut principal)
-- -----------------------------------------------------------------------------
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS follow_up_flag TEXT
    CHECK (follow_up_flag IN ('a_suivre', 'a_relancer'));

-- 3. Migration des données existantes
-- -----------------------------------------------------------------------------
-- a. Anciens "prospect" → "soumission_en_attente"
UPDATE public.jobs
  SET status = 'soumission_en_attente'
  WHERE status = 'prospect';

-- b. "a_suivre" / "a_relancer" → déplacer dans follow_up_flag + remettre soumission_en_attente
UPDATE public.jobs
  SET follow_up_flag = status::TEXT,
      status         = 'soumission_en_attente'
  WHERE status IN ('a_suivre', 'a_relancer');

-- 4. Nouveaux champs sur quote_units (# série par unité — non obligatoire)
-- -----------------------------------------------------------------------------
ALTER TABLE public.quote_units
  ADD COLUMN IF NOT EXISTS serial_number TEXT;

-- 5. Nouveaux champs financiers sur quotes
-- -----------------------------------------------------------------------------
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS montant_subvention NUMERIC(10,2);

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS total_net NUMERIC(10,2);
