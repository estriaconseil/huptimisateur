-- =============================================================================
-- Migration : Journal d'audit universel (Niveau C — triggers automatiques)
-- Date      : 2026-10-23
--
-- Objectif :
--   • Tracer automatiquement chaque INSERT / UPDATE / DELETE sur les tables
--     critiques, peu importe l'origine (app, Studio, script, cron).
--   • Stocker l'état avant / après en JSONB pour permettre un diff complet.
--   • Import rétroactif non-contraignant des données existantes.
--
-- Tables auditées : sales_appointments, jobs, clients, schedules
-- =============================================================================

-- ── 1. Table d'audit ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT        NOT NULL,
  record_id   UUID        NOT NULL,
  operation   TEXT        NOT NULL,
  old_data    JSONB,
  new_data    JSONB,
  changed_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_operation_chk CHECK (operation IN ('INSERT','UPDATE','DELETE'))
);

CREATE INDEX IF NOT EXISTS audit_log_record_idx
  ON public.audit_log (table_name, record_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_changed_at_idx
  ON public.audit_log (changed_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_changed_by_idx
  ON public.audit_log (changed_by);

-- ── 2. RLS : lecture admin seulement, écriture via trigger uniquement ─────────

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_read_admin ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

-- ── 3. Fonction trigger générique ────────────────────────────────────────────
-- SECURITY DEFINER → contourne la RLS pour écrire dans audit_log.
-- auth.uid() reste accessible car il lit un GUC de session (request.jwt.claim.sub)
-- qui est défini par PostgREST avant chaque requête.

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id UUID;
  v_old_data  JSONB;
  v_new_data  JSONB;
  v_user_id   UUID;
BEGIN
  -- Récupérer l'utilisateur connecté (NULL si trigger hors contexte PostgREST)
  v_user_id := auth.uid();

  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old_data  := to_jsonb(OLD);
    v_new_data  := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    v_old_data  := NULL;
    v_new_data  := to_jsonb(NEW);
  ELSE
    -- UPDATE : ignorer si aucun champ n'a changé
    IF to_jsonb(OLD) = to_jsonb(NEW) THEN
      RETURN NEW;
    END IF;
    v_record_id := NEW.id;
    v_old_data  := to_jsonb(OLD);
    v_new_data  := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_log
    (table_name, record_id, operation, old_data, new_data, changed_by, changed_at)
  VALUES
    (TG_TABLE_NAME, v_record_id, TG_OP, v_old_data, v_new_data, v_user_id, now());

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 4. Attacher le trigger sur les tables critiques ───────────────────────────

DROP TRIGGER IF EXISTS audit_sales_appointments_trg ON public.sales_appointments;
CREATE TRIGGER audit_sales_appointments_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_appointments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_jobs_trg ON public.jobs;
CREATE TRIGGER audit_jobs_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_clients_trg ON public.clients;
CREATE TRIGGER audit_clients_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_schedules_trg ON public.schedules;
CREATE TRIGGER audit_schedules_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ── 5. Import rétroactif non-contraignant ────────────────────────────────────
-- Une entrée "INSERT" par enregistrement existant, avec created_at / created_by.
-- N'insère que si aucune entrée n'existe déjà (idempotent).

-- sales_appointments — a created_by
INSERT INTO public.audit_log
  (table_name, record_id, operation, old_data, new_data, changed_by, changed_at)
SELECT
  'sales_appointments',
  sa.id,
  'INSERT',
  NULL,
  to_jsonb(sa),
  sa.created_by,
  sa.created_at
FROM public.sales_appointments sa
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_log al
  WHERE al.table_name = 'sales_appointments' AND al.record_id = sa.id
);

-- jobs — a created_by
INSERT INTO public.audit_log
  (table_name, record_id, operation, old_data, new_data, changed_by, changed_at)
SELECT
  'jobs',
  j.id,
  'INSERT',
  NULL,
  to_jsonb(j),
  j.created_by,
  j.created_at
FROM public.jobs j
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_log al
  WHERE al.table_name = 'jobs' AND al.record_id = j.id
);

-- clients — pas de created_by (changed_by = NULL)
INSERT INTO public.audit_log
  (table_name, record_id, operation, old_data, new_data, changed_by, changed_at)
SELECT
  'clients',
  c.id,
  'INSERT',
  NULL,
  to_jsonb(c),
  NULL,
  c.created_at
FROM public.clients c
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_log al
  WHERE al.table_name = 'clients' AND al.record_id = c.id
);

-- schedules — pas de created_by (changed_by = NULL)
INSERT INTO public.audit_log
  (table_name, record_id, operation, old_data, new_data, changed_by, changed_at)
SELECT
  'schedules',
  s.id,
  'INSERT',
  NULL,
  to_jsonb(s),
  NULL,
  s.created_at
FROM public.schedules s
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_log al
  WHERE al.table_name = 'schedules' AND al.record_id = s.id
);
