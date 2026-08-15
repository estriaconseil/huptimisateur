-- =============================================================================
-- Migration : Extensions soumissions (Phase 1)
-- Date      : 2026-08-02
--
-- Objectif :
--   • quote_units : unités alternatives, subvention par unité, bypass # série
--   • quotes      : champ dessin (sketch_data)
-- =============================================================================

-- ── 1. Colonnes quote_units ───────────────────────────────────────────────────

-- Unité appartient au groupe alternatif (n'est pas incluse dans le total principal)
ALTER TABLE public.quote_units
  ADD COLUMN IF NOT EXISTS is_alternative  boolean NOT NULL DEFAULT false;

-- Montant de subvention spécifique à cette unité
ALTER TABLE public.quote_units
  ADD COLUMN IF NOT EXISTS subsidy_amount  numeric(10, 2) NOT NULL DEFAULT 0;

-- Permet de répartir la job sans avoir entré le # de série pour cette unité
ALTER TABLE public.quote_units
  ADD COLUMN IF NOT EXISTS serial_bypass   boolean NOT NULL DEFAULT false;

-- ── 2. Colonne quotes.sketch_data ────────────────────────────────────────────
-- Stocke le dessin de plan/schéma en base64 PNG (même principe que signature_data)

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS sketch_data text;
