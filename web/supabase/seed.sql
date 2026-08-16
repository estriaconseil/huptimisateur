-- =============================================================================
-- MINI-SEED — 3 scénarios multi-soumissions
-- À coller dans Supabase → SQL Editor APRÈS purge_test_data.sql.
-- Ne PAS exécuter l'ancien seed (Marie Tremblay / Patrick Audet).
--
-- A  Job ouverte, aucune soumission  → pipeline : « Créer soumission » seulement
-- B  Soumission existante            → fiche + pipeline : Nouvelle / Reprendre
-- C  Ancien proprio + nouveau        → historique du lieu + Reprendre
-- =============================================================================

BEGIN;

-- Vendeur : Jean Martineau s'il existe encore, sinon le premier actif
-- (sous-requête répétée — pas de CTE partagé entre INSERT)

-- ── IDs fixes ────────────────────────────────────────────────────────────────
-- Clients
-- A  11000000-...-001  Sophie Gagnon     (Coaticook, job ouverte)
-- B  11000000-...-002  Martin Dubois     (Sherbrooke, quote #30001)
-- C1 11000000-...-003  Robert Lafleur    (Stoke, ancien proprio, quote #30002)
-- C2 11000000-...-004  Isabelle Gagné    (Stoke, même adresse, nouveau proprio)

-- Adresses d'install
-- A  12000000-...-001
-- B  12000000-...-002
-- C1 12000000-...-003  (Robert)
-- C2 12000000-...-004  (Isabelle, même texte)

-- Jobs
-- A  13000000-...-001  soumission_en_attente
-- B  13000000-...-002  en_attente
-- C1 13000000-...-003  termine
-- C2 13000000-...-004  soumission_en_attente

-- Quotes
-- B  14000000-...-001  #30001
-- C1 14000000-...-002  #30002

-- ── Clients ──────────────────────────────────────────────────────────────────
INSERT INTO public.clients (
  id, name, phone, email,
  billing_address, billing_city, billing_postal,
  address_formatted, city, postal_code, lat, lng
)
SELECT v.id, v.name, v.phone, v.email,
       v.billing_address, v.billing_city, v.billing_postal,
       v.address_formatted, v.city, v.postal_code, v.lat, v.lng
FROM (VALUES
  (
    '11000000-0000-0000-0000-000000000001'::uuid,
    'Sophie Gagnon', '819-849-2001', 'sophie.gagnon@example.com',
    '120 Rue Cutting, Coaticook, QC J1A 1X5', 'Coaticook', 'J1A 1X5',
    '120 Rue Cutting, Coaticook, QC J1A 1X5', 'Coaticook', 'J1A 1X5',
    45.1302, -71.8054
  ),
  (
    '11000000-0000-0000-0000-000000000002'::uuid,
    'Martin Dubois', '819-555-2002', 'martin.dubois@example.com',
    '456 Rue King E, Sherbrooke, QC J1G 1B1', 'Sherbrooke', 'J1G 1B1',
    '456 Rue King E, Sherbrooke, QC J1G 1B1', 'Sherbrooke', 'J1G 1B1',
    45.4044, -71.8780
  ),
  (
    '11000000-0000-0000-0000-000000000003'::uuid,
    'Robert Lafleur', '819-878-2003', null,
    '88 Chemin du Moulin, Stoke, QC J0B 3G0', 'Stoke', 'J0B 3G0',
    '88 Chemin du Moulin, Stoke, QC J0B 3G0', 'Stoke', 'J0B 3G0',
    45.4992, -71.9680
  ),
  (
    '11000000-0000-0000-0000-000000000004'::uuid,
    'Isabelle Gagné', '819-878-2004', 'isabelle.gagne@example.com',
    '88 Chemin du Moulin, Stoke, QC J0B 3G0', 'Stoke', 'J0B 3G0',
    '88 Chemin du Moulin, Stoke, QC J0B 3G0', 'Stoke', 'J0B 3G0',
    45.4992, -71.9680
  )
) AS v(id, name, phone, email, billing_address, billing_city, billing_postal,
       address_formatted, city, postal_code, lat, lng)
ON CONFLICT (id) DO NOTHING;

-- ── Adresses d'installation ──────────────────────────────────────────────────
INSERT INTO public.installation_addresses (
  id, client_id, label, address_formatted, city, postal_code, lat, lng
)
VALUES
  (
    '12000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'Adresse principale',
    '120 Rue Cutting, Coaticook, QC J1A 1X5', 'Coaticook', 'J1A 1X5',
    45.1302, -71.8054
  ),
  (
    '12000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000002',
    'Adresse principale',
    '456 Rue King E, Sherbrooke, QC J1G 1B1', 'Sherbrooke', 'J1G 1B1',
    45.4044, -71.8780
  ),
  (
    '12000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000003',
    'Adresse principale',
    '88 Chemin du Moulin, Stoke, QC J0B 3G0', 'Stoke', 'J0B 3G0',
    45.4992, -71.9680
  ),
  (
    '12000000-0000-0000-0000-000000000004',
    '11000000-0000-0000-0000-000000000004',
    'Adresse principale',
    '88 Chemin du Moulin, Stoke, QC J0B 3G0', 'Stoke', 'J0B 3G0',
    45.4992, -71.9680
  )
ON CONFLICT (id) DO NOTHING;

-- ── Jobs ─────────────────────────────────────────────────────────────────────
INSERT INTO public.jobs (
  id, client_id, installation_address_id, salesperson_id,
  status, installation_info, estimated_duration_hours
)
SELECT
  v.id, v.client_id, v.install_id,
  (SELECT id FROM public.salespeople WHERE active = true
   ORDER BY CASE WHEN name = 'Jean Martineau' THEN 0 ELSE 1 END, name LIMIT 1),
  v.status::public.job_status, v.info, 4
FROM (VALUES
  (
    '13000000-0000-0000-0000-000000000001'::uuid,
    '11000000-0000-0000-0000-000000000001'::uuid,
    '12000000-0000-0000-0000-000000000001'::uuid,
    'soumission_en_attente',
    '1 unité split — sous-sol'
  ),
  (
    '13000000-0000-0000-0000-000000000002'::uuid,
    '11000000-0000-0000-0000-000000000002'::uuid,
    '12000000-0000-0000-0000-000000000002'::uuid,
    'en_attente',
    'Thermopompe murale salon'
  ),
  (
    '13000000-0000-0000-0000-000000000003'::uuid,
    '11000000-0000-0000-0000-000000000003'::uuid,
    '12000000-0000-0000-0000-000000000003'::uuid,
    'termine',
    'Installation 2024 — 1 unité'
  ),
  (
    '13000000-0000-0000-0000-000000000004'::uuid,
    '11000000-0000-0000-0000-000000000004'::uuid,
    '12000000-0000-0000-0000-000000000004'::uuid,
    'soumission_en_attente',
    'Nouveau propriétaire — 2e unité'
  )
) AS v(id, client_id, install_id, status, info)
ON CONFLICT (id) DO NOTHING;

-- ── Soumissions ──────────────────────────────────────────────────────────────
INSERT INTO public.quotes (
  id, quote_number, job_id, client_id, salesperson_id,
  client_name, client_address, client_phone, client_email,
  quote_date, status, subtotal, montant_subvention, total_net, has_subsidy
)
SELECT
  v.id, v.quote_number, v.job_id, v.client_id,
  (SELECT id FROM public.salespeople WHERE active = true
   ORDER BY CASE WHEN name = 'Jean Martineau' THEN 0 ELSE 1 END, name LIMIT 1),
  v.client_name, v.client_address, v.client_phone, v.client_email,
  v.quote_date::date, v.status, v.subtotal, v.montant_subvention, v.total_net, v.has_subsidy
FROM (VALUES
  (
    '14000000-0000-0000-0000-000000000001'::uuid,
    30001,
    '13000000-0000-0000-0000-000000000002'::uuid,
    '11000000-0000-0000-0000-000000000002'::uuid,
    'Martin Dubois',
    '456 Rue King E, Sherbrooke, QC J1G 1B1',
    '819-555-2002',
    'martin.dubois@example.com',
    CURRENT_DATE - 14,
    'pending',
    4850.00, 0, 4850.00, false
  ),
  (
    '14000000-0000-0000-0000-000000000002'::uuid,
    30002,
    '13000000-0000-0000-0000-000000000003'::uuid,
    '11000000-0000-0000-0000-000000000003'::uuid,
    'Robert Lafleur',
    '88 Chemin du Moulin, Stoke, QC J0B 3G0',
    '819-878-2003',
    null,
    CURRENT_DATE - 400,
    'accepted',
    6200.00, 1300.00, 4900.00, true
  )
) AS v(id, quote_number, job_id, client_id, client_name, client_address,
       client_phone, client_email, quote_date, status, subtotal,
       montant_subvention, total_net, has_subsidy)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.quote_units (
  quote_id, unit_order, description, brand, model, capacity_btu,
  unit_subtotal, subsidy_amount, difficulty, tech_count
)
VALUES
  (
    '14000000-0000-0000-0000-000000000001',
    1, 'Thermopompe murale salon', 'Midea', 'U-18', '18000',
    4850.00, 0, 'easy', 1
  ),
  (
    '14000000-0000-0000-0000-000000000002',
    1, 'Thermopompe murale salon', 'Daikin', 'FTXS18', '18000',
    6200.00, 1300.00, 'medium', 2
  )
ON CONFLICT (quote_id, unit_order) DO NOTHING;

-- Prochaine soumission créée dans l'app = #30003
SELECT setval('public.quote_number_seq', 30003, false);

COMMIT;

-- ── Vérification ─────────────────────────────────────────────────────────────
SELECT 'clients' AS table_name, count(*) FROM public.clients
UNION ALL SELECT 'installation_addresses', count(*) FROM public.installation_addresses
UNION ALL SELECT 'jobs',                   count(*) FROM public.jobs
UNION ALL SELECT 'quotes',                 count(*) FROM public.quotes
UNION ALL SELECT 'quote_units',            count(*) FROM public.quote_units;
