-- =============================================================================
-- Migration : Lien direct job → sales_appointment
-- Date       : 2026-07-05
-- Permet d'accéder directement à la soumission depuis la carte pipeline
-- sans passer par le calendrier ventes.
-- =============================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS appointment_id UUID
    REFERENCES public.sales_appointments(id) ON DELETE SET NULL;
