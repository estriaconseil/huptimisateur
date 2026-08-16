-- =============================================================================
-- PURGE DES DONNÉES MÉTIER DE TEST
-- À coller dans Supabase → SQL Editor.
-- IRRÉVERSIBLE. Exécuter une seule fois, puis coller seed.sql.
--
-- Conservé :
--   auth.users, profiles
--   salespeople, salesperson_day_config, salesperson_blocks
--   teams, technicians, team_technicians, team_blocks
--   app_settings, interruption_settings, interruption_runs
--
-- Supprimé :
--   clients, installation_addresses, jobs, quotes, quote_units,
--   sales_appointments, schedules, job_notes, job_activity_log
-- =============================================================================

BEGIN;

TRUNCATE TABLE
  public.quote_units,
  public.quotes,
  public.job_notes,
  public.job_activity_log,
  public.schedules,
  public.sales_appointments,
  public.jobs,
  public.installation_addresses,
  public.clients
RESTART IDENTITY CASCADE;

ALTER SEQUENCE public.quote_number_seq RESTART WITH 30001;

COMMIT;

-- Vérification : ces lignes doivent afficher 0
SELECT 'clients' AS table_name, count(*) FROM public.clients
UNION ALL SELECT 'installation_addresses', count(*) FROM public.installation_addresses
UNION ALL SELECT 'jobs',                   count(*) FROM public.jobs
UNION ALL SELECT 'quotes',                 count(*) FROM public.quotes
UNION ALL SELECT 'quote_units',            count(*) FROM public.quote_units
UNION ALL SELECT 'sales_appointments',     count(*) FROM public.sales_appointments
UNION ALL SELECT 'schedules',              count(*) FROM public.schedules
UNION ALL SELECT 'salespeople (gardé)',    count(*) FROM public.salespeople
UNION ALL SELECT 'teams (gardé)',          count(*) FROM public.teams
UNION ALL SELECT 'profiles (gardé)',       count(*) FROM public.profiles;
