-- =============================================================================
-- Migration : Dénormalisation Option A — sales_appointments
-- Date      : 2026-07-23
--
-- Supprime les colonnes client_name / client_phone / client_address
-- (dupliquées depuis la table clients) et impose client_id NOT NULL.
-- Les coordonnées client_lat / client_lng (spécifiques au RDV) sont conservées.
--
-- IMPORTANT : Appliquer sur la DB de test avant production.
-- =============================================================================

-- ── 1. Rétro-remplissage client_id depuis les soumissions liées ───────────────
UPDATE public.sales_appointments sa
SET client_id = j.client_id
FROM public.quotes q
JOIN public.jobs j ON j.id = q.job_id
WHERE q.appointment_id = sa.id
  AND sa.client_id IS NULL
  AND j.client_id IS NOT NULL;

-- ── 2. Créer des clients minimaux pour les RDV sans client_id ─────────────────
DO $$
DECLARE
  appt RECORD;
  new_cid UUID;
BEGIN
  FOR appt IN
    SELECT id, client_name, client_phone, client_address
    FROM public.sales_appointments
    WHERE client_id IS NULL
      AND client_name IS NOT NULL
      AND client_name <> ''
  LOOP
    INSERT INTO public.clients (name, phone, address_formatted)
    VALUES (appt.client_name, appt.client_phone, appt.client_address)
    RETURNING id INTO new_cid;

    UPDATE public.sales_appointments SET client_id = new_cid WHERE id = appt.id;
  END LOOP;
END $$;

-- ── 3. Rendre client_id obligatoire ──────────────────────────────────────────
ALTER TABLE public.sales_appointments
  ALTER COLUMN client_id SET NOT NULL;

-- Adapter la contrainte FK : SET NULL → RESTRICT
ALTER TABLE public.sales_appointments
  DROP CONSTRAINT IF EXISTS sales_appointments_client_id_fkey;
ALTER TABLE public.sales_appointments
  ADD CONSTRAINT sales_appointments_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;

-- ── 4. Supprimer les colonnes dénormalisées ───────────────────────────────────
ALTER TABLE public.sales_appointments
  DROP COLUMN IF EXISTS client_name,
  DROP COLUMN IF EXISTS client_phone,
  DROP COLUMN IF EXISTS client_address;
