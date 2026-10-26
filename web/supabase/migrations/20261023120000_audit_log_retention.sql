-- =============================================================================
-- Rétention audit_log : garder 12 mois, purger le reste (hebdomadaire)
-- =============================================================================
--
-- Comment activer dans Supabase (Dashboard) :
--   1. Database → Extensions → activer « pg_cron » (si pas déjà actif)
--   2. Exécuter cette migration (supabase db push / SQL Editor)
--   3. Vérifier le job : SELECT * FROM cron.job WHERE jobname = 'purge-audit-log-weekly';
--
-- Test manuel :
--   SELECT public.purge_audit_log_older_than('12 months');
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_audit_log_older_than(
  retention interval DEFAULT '12 months'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM public.audit_log
  WHERE changed_at < (now() - retention);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_audit_log_older_than(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_audit_log_older_than(interval) TO postgres;

-- pg_cron : dimanche 03:00 UTC — ne planifie qu'une seule fois (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'purge-audit-log-weekly'
    ) THEN
      PERFORM cron.schedule(
        'purge-audit-log-weekly',
        '0 3 * * 0',
        $cron$SELECT public.purge_audit_log_older_than('12 months')$cron$
      );
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron non installé — activez l''extension puis rejouez la planification (voir en-tête de cette migration).';
  END IF;
END;
$$;
