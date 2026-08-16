-- =============================================================================
-- Migration : Plus de 6 unités par soumission (Option A / B dynamiques)
-- Date      : 2026-08-16
-- =============================================================================

ALTER TABLE public.quote_units
  DROP CONSTRAINT IF EXISTS quote_units_order_chk;

ALTER TABLE public.quote_units
  ADD CONSTRAINT quote_units_order_chk
    CHECK (unit_order >= 1);
