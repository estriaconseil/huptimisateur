-- =============================================================================
-- Migration : Élargir la contrainte unit_order à 6 unités (3 principal + 3 alternatif)
-- Date      : 2026-08-02
-- =============================================================================

-- Retirer l'ancienne contrainte (limitait à 1-3 ou similaire)
ALTER TABLE public.quote_units
  DROP CONSTRAINT IF EXISTS quote_units_order_chk;

-- Recréer avec 1-6
ALTER TABLE public.quote_units
  ADD CONSTRAINT quote_units_order_chk
    CHECK (unit_order BETWEEN 1 AND 6);
