-- Migration : Champ cellulaire sur les clients
-- Date : 2026-10-23
--
-- Objectif :
--   Stéphane #1 — Permettre de saisir un numéro de cellulaire distinct du
--   téléphone résidentiel directement sur la fiche client (et non uniquement
--   comme snapshot dans les soumissions).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cell TEXT;
