-- Migration : acceptation de soumission (option retenue + timestamp) + bypass global # série

-- 1. Colonne accepted_option sur quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS accepted_option text CHECK (accepted_option IN ('a', 'b')),
  ADD COLUMN IF NOT EXISTS accepted_at     timestamptz;

-- 2. Colonne serial_bypass_global sur app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS serial_bypass_global boolean NOT NULL DEFAULT false;
