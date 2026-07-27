-- =============================================================================
-- Migration : Journal d'activité horodaté + Notes libres par job
-- Date      : 2026-07-22
-- =============================================================================

-- ── 1. Journal d'activité ─────────────────────────────────────────────────────
-- Enregistre chaque action significative sur un job (statut, RDV, installation…)

CREATE TABLE IF NOT EXISTS public.job_activity_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  actor_id   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     TEXT        NOT NULL,   -- ex: 'status_changed', 'appointment_booked', …
  details    JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_activity_log_job_idx
  ON public.job_activity_log (job_id, created_at DESC);

ALTER TABLE public.job_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY jal_all_auth ON public.job_activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. Notes libres par job ───────────────────────────────────────────────────
-- Notes texte libres, horodatées et attribuées à un utilisateur

CREATE TABLE IF NOT EXISTS public.job_notes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  author_id  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_notes_job_idx
  ON public.job_notes (job_id, created_at DESC);

ALTER TABLE public.job_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY jn_all_auth ON public.job_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
