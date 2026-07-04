-- ══════════════════════════════════════════════════════════════════════════════
-- Grande migration : pipeline unifié, statuts FR, schéma ventes complet
-- Aucune donnée à préserver — DROP/CREATE complet sur les tables concernées.
-- Tables conservées intactes : clients, teams, team_technicians, technicians,
--                              profiles, app_settings
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. Supprimer les tables dans l'ordre des dépendances ─────────────────────
DROP TABLE IF EXISTS public.quote_units         CASCADE;
DROP TABLE IF EXISTS public.quotes              CASCADE;
DROP TABLE IF EXISTS public.sales_appointments  CASCADE;
DROP TABLE IF EXISTS public.schedules           CASCADE;
DROP TABLE IF EXISTS public.jobs                CASCADE;
DROP TABLE IF EXISTS public.salesperson_blocks  CASCADE;
DROP TABLE IF EXISTS public.salesperson_day_config CASCADE;
DROP TABLE IF EXISTS public.salesperson_config  CASCADE;
DROP TABLE IF EXISTS public.salespeople         CASCADE;
DROP TABLE IF EXISTS public.team_blocks         CASCADE;

-- ── 1. Mettre à jour les enums ────────────────────────────────────────────────
-- Ajouter le rôle vendeur (idempotent)
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'salesperson';

-- Remplacer job_status par les statuts en français
DROP TYPE IF EXISTS public.job_status CASCADE;
CREATE TYPE public.job_status AS ENUM (
  'prospect',              -- Fiche créée, pas encore de soumission
  'soumission_en_attente', -- Soumission envoyée, attente réponse client
  'a_suivre',              -- Nécessite un suivi actif
  'a_relancer',            -- Rappeler à une date future
  'a_planifier',           -- Soumission acceptée, à mettre au calendrier
  'reparti',               -- Assigné à une plage d'installation
  'facturation',           -- Installation complétée, à facturer
  'complete',              -- Dossier fermé positivement
  'annule'                 -- Annulé (avec raison)
);

-- ── 2. Vendeurs ───────────────────────────────────────────────────────────────
CREATE TABLE public.salespeople (
  id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT            NOT NULL,
  active        BOOLEAN         NOT NULL DEFAULT TRUE,
  profile_id    UUID            REFERENCES public.profiles(id) ON DELETE SET NULL,
  home_address  TEXT,
  home_lat      DOUBLE PRECISION,
  home_lng      DOUBLE PRECISION,
  notes         TEXT,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX salespeople_active_idx  ON public.salespeople (active);
CREATE INDEX salespeople_profile_idx ON public.salespeople (profile_id);

-- ── 3. Horaires par jour par vendeur ──────────────────────────────────────────
CREATE TABLE public.salesperson_day_config (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id  UUID    NOT NULL REFERENCES public.salespeople(id) ON DELETE CASCADE,
  day_of_week     INTEGER NOT NULL,  -- 1=Lun 2=Mar 3=Mer 4=Jeu 5=Ven 6=Sam 7=Dim
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  work_start_time TIME    NOT NULL DEFAULT '08:00',
  work_end_time   TIME    NOT NULL DEFAULT '17:00',
  UNIQUE (salesperson_id, day_of_week),
  CONSTRAINT day_of_week_chk CHECK (day_of_week BETWEEN 1 AND 7)
);

CREATE INDEX salesperson_day_config_sp_idx ON public.salesperson_day_config (salesperson_id);

-- ── 4. Blocages vendeurs (vacances, bureau) ────────────────────────────────────
CREATE TABLE public.salesperson_blocks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id UUID        NOT NULL REFERENCES public.salespeople(id) ON DELETE CASCADE,
  block_type     TEXT        NOT NULL DEFAULT 'vacances',
  start_date     DATE        NOT NULL,
  end_date       DATE        NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT salesperson_block_type_chk CHECK (block_type IN ('vacances','bureau','autre')),
  CONSTRAINT salesperson_block_dates_chk CHECK (end_date >= start_date)
);

CREATE INDEX salesperson_blocks_sp_dates_idx ON public.salesperson_blocks (salesperson_id, start_date, end_date);

-- ── 5. Blocages équipes installation (AM/PM/journée) ─────────────────────────
CREATE TABLE public.team_blocks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  blocked_date DATE        NOT NULL,
  slot_type    TEXT        NOT NULL DEFAULT 'full_day',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_block_slot_chk CHECK (slot_type IN ('am','pm','full_day'))
);

CREATE INDEX team_blocks_team_date_idx ON public.team_blocks (team_id, blocked_date);

-- ── 6. Jobs (pipeline unifié) ─────────────────────────────────────────────────
CREATE TABLE public.jobs (
  id                       UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                UUID              NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  salesperson_id           UUID              REFERENCES public.salespeople(id) ON DELETE SET NULL,
  installation_info        TEXT,
  internal_notes           TEXT,
  estimated_duration_hours INTEGER           NOT NULL DEFAULT 4,
  preferred_date           DATE,
  status                   public.job_status NOT NULL DEFAULT 'prospect',
  follow_up_date           DATE,
  cancellation_reason      TEXT,             -- 'autre_entreprise' | 'prix' | 'reporte' | 'autre'
  cancellation_notes       TEXT,
  created_by               UUID              REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ       NOT NULL DEFAULT now(),
  CONSTRAINT jobs_duration_chk CHECK (estimated_duration_hours IN (4, 8))
);

CREATE INDEX jobs_client_idx      ON public.jobs (client_id);
CREATE INDEX jobs_status_idx      ON public.jobs (status);
CREATE INDEX jobs_salesperson_idx ON public.jobs (salesperson_id);

-- ── 7. Schedules (plages d'installation) ──────────────────────────────────────
CREATE TABLE public.schedules (
  id             UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID                       NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id        UUID                       NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  scheduled_date DATE                       NOT NULL,
  slot_type      public.schedule_slot       NOT NULL,
  status         public.schedule_row_status NOT NULL DEFAULT 'planned',
  created_at     TIMESTAMPTZ                NOT NULL DEFAULT now()
);

CREATE INDEX schedules_team_date_idx ON public.schedules (team_id, scheduled_date);
CREATE INDEX schedules_job_idx       ON public.schedules (job_id);

-- Recréer le garde-fou AM/PM/full_day (fonction existe déjà en DB)
CREATE TRIGGER schedules_team_date_guard_trg
  BEFORE INSERT OR UPDATE ON public.schedules
  FOR EACH ROW EXECUTE PROCEDURE public.schedules_team_date_guard();

-- ── 8. Rendez-vous vente ───────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START WITH 30001;
GRANT USAGE, SELECT ON SEQUENCE public.quote_number_seq TO authenticated;

CREATE TABLE public.sales_appointments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id UUID        NOT NULL REFERENCES public.salespeople(id) ON DELETE RESTRICT,
  client_id      UUID        REFERENCES public.clients(id) ON DELETE SET NULL,
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
  CONSTRAINT sales_appt_status_chk
    CHECK (status IN ('scheduled','completed','cancelled','no_show'))
);

CREATE INDEX sales_appointments_date_idx        ON public.sales_appointments (scheduled_date);
CREATE INDEX sales_appointments_salesperson_idx ON public.sales_appointments (salesperson_id);
CREATE INDEX sales_appointments_client_idx      ON public.sales_appointments (client_id);

-- ── 9. Soumissions (liées au client ET au job) ────────────────────────────────
CREATE TABLE public.quotes (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number            INTEGER      NOT NULL UNIQUE DEFAULT nextval('public.quote_number_seq'),
  appointment_id          UUID         REFERENCES public.sales_appointments(id) ON DELETE SET NULL,
  client_id               UUID         REFERENCES public.clients(id) ON DELETE SET NULL,
  job_id                  UUID         REFERENCES public.jobs(id) ON DELETE SET NULL,

  client_name             TEXT         NOT NULL DEFAULT '',
  client_address          TEXT,
  client_work_address     TEXT,
  client_phone            TEXT,
  client_cell             TEXT,
  client_email            TEXT,

  has_subsidy             BOOLEAN      NOT NULL DEFAULT FALSE,
  ready_to_schedule       BOOLEAN      NOT NULL DEFAULT FALSE,
  will_call_back          BOOLEAN      NOT NULL DEFAULT FALSE,
  quote_date              DATE         NOT NULL DEFAULT CURRENT_DATE,

  inst_prepiping          BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_drill_concrete     BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_through_attic      BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_through_basement   BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_through_garage     BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_through_closet     BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_appliance_change   BOOLEAN      NOT NULL DEFAULT FALSE,
  inst_through_stairs     BOOLEAN      NOT NULL DEFAULT FALSE,

  electrical_amperage     TEXT,
  electrical_panel        TEXT,
  electrical_included     BOOLEAN      NOT NULL DEFAULT FALSE,
  electrical_not_included BOOLEAN      NOT NULL DEFAULT FALSE,
  electrical_to_schedule  BOOLEAN      NOT NULL DEFAULT FALSE,
  electrical_initials     TEXT,

  notes                   TEXT,
  subtotal                NUMERIC(10,2) NOT NULL DEFAULT 0,
  deposit                 NUMERIC(10,2),

  salesperson_id          UUID         REFERENCES public.salespeople(id) ON DELETE SET NULL,
  approved_by             TEXT,
  signature_data          TEXT,

  status                  TEXT         NOT NULL DEFAULT 'draft',
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT quotes_status_chk CHECK (status IN ('draft','pending','accepted','refused'))
);

CREATE INDEX quotes_status_idx      ON public.quotes (status);
CREATE INDEX quotes_client_idx      ON public.quotes (client_id);
CREATE INDEX quotes_appointment_idx ON public.quotes (appointment_id);

CREATE TRIGGER quotes_updated_at_trg
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ── 10. Unités de soumission ──────────────────────────────────────────────────
CREATE TABLE public.quote_units (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id            UUID          NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  unit_order          INTEGER       NOT NULL,
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

-- FK circulaire appointments ↔ quotes
ALTER TABLE public.sales_appointments
  ADD CONSTRAINT fk_sales_appt_quote
  FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE SET NULL;

-- ── 11. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.salespeople            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesperson_day_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesperson_blocks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_blocks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_appointments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_units            ENABLE ROW LEVEL SECURITY;

-- Salespeople : lecture tous, écriture admin
CREATE POLICY salespeople_select_auth   ON public.salespeople FOR SELECT TO authenticated USING (true);
CREATE POLICY salespeople_write_admin   ON public.salespeople FOR ALL    TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Nouvelles tables : tous connectés (MVP interne)
CREATE POLICY sdc_all_auth     ON public.salesperson_day_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sb_all_auth      ON public.salesperson_blocks     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tb_all_auth      ON public.team_blocks            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY jobs_all_auth    ON public.jobs                   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sched_all_auth   ON public.schedules              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sa_all_auth      ON public.sales_appointments     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY quotes_all_auth  ON public.quotes                 FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY qu_all_auth      ON public.quote_units            FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 12. Données de départ ─────────────────────────────────────────────────────
INSERT INTO public.salespeople (name, active)
SELECT v.name, v.active
FROM (VALUES ('Vendeur 1', true), ('Vendeur 2', true)) AS v(name, active)
WHERE NOT EXISTS (SELECT 1 FROM public.salespeople);

-- Horaires lun-ven 08:00-17:00 pour chaque vendeur
INSERT INTO public.salesperson_day_config (salesperson_id, day_of_week, active, work_start_time, work_end_time)
SELECT sp.id, d.dow, true, '08:00'::TIME, '17:00'::TIME
FROM public.salespeople sp
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(dow)
WHERE NOT EXISTS (
  SELECT 1 FROM public.salesperson_day_config c WHERE c.salesperson_id = sp.id
);
