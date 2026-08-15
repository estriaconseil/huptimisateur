-- =============================================================================
-- Migration : Adresses d'installation séparées + adresse de facturation
-- Date      : 2026-08-02
--
-- Objectif :
--   • Distinguer l'adresse de facturation (sur clients) de l'adresse
--     d'installation (nouvelle table installation_addresses, 1..N par client).
--   • Garder la compatibilité avec le code existant (colonnes actuelles
--     non supprimées ici — elles seront retirées lors de la Phase 3 UI).
-- =============================================================================

-- ── 1. Adresse de facturation sur clients ─────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_address  text,
  ADD COLUMN IF NOT EXISTS billing_city     text,
  ADD COLUMN IF NOT EXISTS billing_postal   text;

-- Rétro-remplissage depuis les colonnes existantes
UPDATE public.clients
SET
  billing_address = address_formatted,
  billing_city    = city,
  billing_postal  = postal_code
WHERE billing_address IS NULL;

-- ── 2. Table installation_addresses ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.installation_addresses (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid         NOT NULL
                                REFERENCES public.clients (id) ON DELETE CASCADE,
  label            text,                          -- ex: "Maison", "Chalet", "Condo"
  address_formatted text,
  city             text,
  postal_code      text,
  lat              double precision,
  lng              double precision,
  installation_info text,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS installation_addresses_client_idx
  ON public.installation_addresses (client_id);

-- RLS : même logique que clients (authentifié = accès complet)
ALTER TABLE public.installation_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY installation_addresses_auth
  ON public.installation_addresses
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── 3. Migration des adresses existantes ──────────────────────────────────────
-- Pour chaque client existant ayant une adresse, créer une première entrée
-- dans installation_addresses (devient son adresse d'installation principale).

INSERT INTO public.installation_addresses (
  client_id, label, address_formatted, city, postal_code,
  lat, lng, installation_info
)
SELECT
  c.id,
  'Adresse principale',
  c.address_formatted,
  c.city,
  c.postal_code,
  c.lat,
  c.lng,
  c.installation_info
FROM public.clients c
WHERE c.address_formatted IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.installation_addresses ia WHERE ia.client_id = c.id
  );

-- ── 4. Colonne installation_address_id sur jobs ───────────────────────────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS installation_address_id uuid
    REFERENCES public.installation_addresses (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_installation_address_idx
  ON public.jobs (installation_address_id);

-- Lier les jobs existants à la première adresse d'installation de leur client
UPDATE public.jobs j
SET installation_address_id = ia.id
FROM public.installation_addresses ia
WHERE ia.client_id = j.client_id
  AND j.installation_address_id IS NULL;

-- ── 5. Colonne installation_address_id sur sales_appointments ─────────────────

ALTER TABLE public.sales_appointments
  ADD COLUMN IF NOT EXISTS installation_address_id uuid
    REFERENCES public.installation_addresses (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_appointments_installation_address_idx
  ON public.sales_appointments (installation_address_id);

-- Lier les RDV existants via le client
UPDATE public.sales_appointments sa
SET installation_address_id = ia.id
FROM public.installation_addresses ia
WHERE ia.client_id = sa.client_id
  AND sa.installation_address_id IS NULL;
