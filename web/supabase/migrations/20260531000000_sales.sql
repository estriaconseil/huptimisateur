-- Module Ventes : calendrier des vendeurs, soumissions, pipeline
-- Script idempotent : peut être exécuté même si une ancienne version existe déjà.

-- ── 0. Nettoyage de l'ancienne version (si elle a été exécutée) ───────────────
-- On supprime dans l'ordre inverse des dépendances.
DROP TABLE IF EXISTS public.quote_units        CASCADE;
DROP TABLE IF EXISTS public.quotes             CASCADE;
DROP TABLE IF EXISTS public.sales_appointments CASCADE;
DROP TABLE IF EXISTS public.salesperson_config CASCADE;
DROP TABLE IF EXISTS public.salespeople        CASCADE;

-- Retirer la politique profils si elle a été modifiée par l'ancienne version
DROP POLICY IF EXISTS profiles_select_auth          ON public.profiles;
DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;

-- Recréer la politique profils standard (self ou admin)
CREATE POLICY profiles_select_self_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- ── 1. Vendeurs ──────────────────────────────────────────────────────────────
CREATE TABLE public.salespeople (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                         TEXT        NOT NULL,
  active                       BOOLEAN     NOT NULL DEFAULT TRUE,
  work_start_time              TIME        NOT NULL DEFAULT '08:00',
  work_end_time                TIME        NOT NULL DEFAULT '17:00',
  appointment_duration_minutes INTEGER     NOT NULL DEFAULT 90,
  notes                        TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX salespeople_active_idx ON public.salespeople (active);

-- ── 2. Séquence pour les numéros de soumission ──────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START WITH 30001;
GRANT USAGE, SELECT ON SEQUENCE public.quote_number_seq TO authenticated;

-- ── 3. Rendez-vous de vente ──────────────────────────────────────────────────
CREATE TABLE public.sales_appointments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id UUID        NOT NULL REFERENCES public.salespeople(id) ON DELETE RESTRICT,
  client_name    TEXT        NOT NULL,
  client_phone   TEXT,
  client_address TEXT,
  scheduled_date DATE        NOT NULL,
  start_time     TIME        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'scheduled',
  notes          TEXT,
  quote_id       UUID,
  created_by     UUID        REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_appointments_status_chk
    CHECK (status IN ('scheduled','completed','cancelled','no_show'))
);

CREATE INDEX sales_appointments_date_idx        ON public.sales_appointments (scheduled_date);
CREATE INDEX sales_appointments_salesperson_idx ON public.sales_appointments (salesperson_id);
CREATE INDEX sales_appointments_quote_idx       ON public.sales_appointments (quote_id);

-- ── 4. Soumissions ───────────────────────────────────────────────────────────
CREATE TABLE public.quotes (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number              INTEGER      NOT NULL UNIQUE DEFAULT nextval('public.quote_number_seq'),
  appointment_id            UUID         REFERENCES public.sales_appointments(id) ON DELETE SET NULL,

  client_name               TEXT         NOT NULL DEFAULT '',
  client_address            TEXT,
  client_work_address       TEXT,
  client_phone              TEXT,
  client_cell               TEXT,
  client_email              TEXT,

  has_subsidy               BOOLEAN      NOT NULL DEFAULT FALSE,
  ready_to_schedule         BOOLEAN      NOT NULL DEFAULT FALSE,
  will_call_back            BOOLEAN      NOT NULL DEFAULT FALSE,
  quote_date                DATE         NOT NULL DEFAULT CURRENT_DATE,

  inst_prepiping            BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_drill_concrete       BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_through_attic        BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_through_basement     BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_through_garage       BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_through_closet       BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_appliance_change     BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_through_stairs       BOOLEAN      NOT NULL DEFAULT FALSE,

  electrical_amperage       TEXT,
  electrical_panel          TEXT,
  electrical_included       BOOLEAN      NOT NULL DEFAULT FALSE,
  electrical_not_included   BOOLEAN      NOT NULL DEFAULT FALSE,
  electrical_to_schedule    BOOLEAN      NOT NULL DEFAULT FALSE,
  electrical_initials       TEXT,

  notes                     TEXT,
  subtotal                  NUMERIC(10,2) NOT NULL DEFAULT 0,
  deposit                   NUMERIC(10,2),

  salesperson_id            UUID         REFERENCES public.salespeople(id) ON DELETE SET NULL,
  approved_by               TEXT,
  signature_data            TEXT,

  status                    TEXT         NOT NULL DEFAULT 'draft',
  installation_job_id       UUID         REFERENCES public.jobs(id) ON DELETE SET NULL,

  created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT quotes_status_chk CHECK (status IN ('draft','pending','accepted','refused'))
);

CREATE INDEX quotes_status_idx      ON public.quotes (status);
CREATE INDEX quotes_appointment_idx ON public.quotes (appointment_id);
CREATE INDEX quotes_salesperson_idx ON public.quotes (salesperson_id);

CREATE TRIGGER quotes_updated_at_trg
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ── 5. Unités de soumission (1–3 par soumission) ────────────────────────────
CREATE TABLE public.quote_units (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id            UUID         NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  unit_order          INTEGER      NOT NULL,
  description         TEXT,
  brand               TEXT,
  model               TEXT,
  capacity_btu        TEXT,
  heating_capacity_25 TEXT,
  warranty_parts      TEXT,
  warranty_months     TEXT,
  evaporator          TEXT,
  pipe_feet           TEXT,
  cap_long1_length    TEXT,
  cap_long1_color     TEXT,
  cap_long2_length    TEXT,
  cap_long2_color     TEXT,
  support_type        TEXT,
  floor_mount_type    TEXT,
  difficulty          TEXT,
  tech_count          INTEGER,
  unit_subtotal       NUMERIC(10,2) NOT NULL DEFAULT 0,

  UNIQUE (quote_id, unit_order),
  CONSTRAINT quote_units_order_chk      CHECK (unit_order BETWEEN 1 AND 3),
  CONSTRAINT quote_units_difficulty_chk CHECK (difficulty IN ('easy','medium','hard') OR difficulty IS NULL),
  CONSTRAINT quote_units_tech_chk       CHECK (tech_count IN (1,2) OR tech_count IS NULL)
);

-- ── 6. Clé étrangère circulaire (appointments ↔ quotes) ─────────────────────
ALTER TABLE public.sales_appointments
  ADD CONSTRAINT fk_sales_appt_quote
  FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE SET NULL;

-- ── 7. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.salespeople        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_units        ENABLE ROW LEVEL SECURITY;

CREATE POLICY salespeople_select_auth ON public.salespeople
  FOR SELECT TO authenticated USING (true);

CREATE POLICY salespeople_insert_admin ON public.salespeople
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY salespeople_update_admin ON public.salespeople
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY salespeople_delete_admin ON public.salespeople
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY sales_appointments_all_auth ON public.sales_appointments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY quotes_all_auth ON public.quotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY quote_units_all_auth ON public.quote_units
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 8. Données de départ ─────────────────────────────────────────────────────
-- WHERE NOT EXISTS protège contre les doublons si la table existait déjà.
INSERT INTO public.salespeople (name, active, work_start_time, work_end_time, appointment_duration_minutes)
SELECT v.name, v.active, v.ws::TIME, v.we::TIME, 90
FROM (
  VALUES
    ('Vendeur 1', true, '08:00', '17:00'),
    ('Vendeur 2', true, '08:00', '17:00')
) AS v(name, active, ws, we)
WHERE NOT EXISTS (SELECT 1 FROM public.salespeople);
