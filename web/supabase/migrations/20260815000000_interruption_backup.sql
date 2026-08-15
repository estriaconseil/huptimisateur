-- Sprint 1 — Filet anti-panne (PDF Interruption)
-- Destinataires, dernier run, bucket Storage pour le PDF.

CREATE TABLE IF NOT EXISTS public.interruption_settings (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Destinataire test Resend (compte non vérifié) : doit matcher l'email Resend.
  -- Prod : vérifier un domaine sur resend.com/domains puis changer from + recipients.
  recipients      TEXT[] NOT NULL DEFAULT ARRAY['optimisateurhuppe@gmail.com']::TEXT[],
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.interruption_settings (id, recipients)
VALUES (1, ARRAY['optimisateurhuppe@gmail.com']::TEXT[])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.interruption_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  -- generated | stored | emailed | failed
  status          TEXT NOT NULL DEFAULT 'generated',
  email_status    TEXT, -- sent | failed | skipped
  error_message   TEXT,
  storage_path    TEXT,
  file_bytes      INT,
  recipient_count INT NOT NULL DEFAULT 0,
  is_retry        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS interruption_runs_generated_at_idx
  ON public.interruption_runs (generated_at DESC);

ALTER TABLE public.interruption_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interruption_runs ENABLE ROW LEVEL SECURITY;

-- Lecture admin + secrétaire ; écriture via service role / actions serveur
CREATE POLICY interruption_settings_select_staff ON public.interruption_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'secretary')
    )
  );

CREATE POLICY interruption_settings_update_admin ON public.interruption_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY interruption_settings_insert_admin ON public.interruption_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY interruption_runs_select_staff ON public.interruption_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'secretary')
    )
  );

-- Bucket privé pour le dernier PDF
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'interruption-backups',
  'interruption-backups',
  false,
  10485760,
  ARRAY['application/pdf']::TEXT[]
)
ON CONFLICT (id) DO NOTHING;

-- Pas de policy storage pour authenticated : lecture via route API (service role)
