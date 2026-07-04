-- ══════════════════════════════════════════════════════════════════════════════
-- SEED DE TEST — Huptimisateur
-- Exécuter dans Supabase SQL Editor après les migrations.
-- Idempotent : utilise ON CONFLICT DO NOTHING partout.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Vendeurs de test ──────────────────────────────────────────────────────────
-- UUIDs fixes pour pouvoir référencer dans les RDV
INSERT INTO public.salespeople (id, name, active, home_address, home_lat, home_lng)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Jean Martineau',  true,
   '150 Rue Wellington N, Sherbrooke, QC J1H 5A9', 45.4042, -71.8929),
  ('a1000000-0000-0000-0000-000000000002', 'Sophie Labrecque', true,
   '1200 Boul. Portland, Sherbrooke, QC J1J 1V1', 45.3921, -71.9387)
ON CONFLICT (id) DO NOTHING;

-- Horaires par jour (lun-ven 8h-17h) pour Jean
INSERT INTO public.salesperson_day_config (salesperson_id, day_of_week, active, work_start_time, work_end_time)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 1, true, '08:00', '17:00'),
  ('a1000000-0000-0000-0000-000000000001', 2, true, '08:00', '17:00'),
  ('a1000000-0000-0000-0000-000000000001', 3, true, '08:00', '17:00'),
  ('a1000000-0000-0000-0000-000000000001', 4, true, '08:00', '17:00'),
  ('a1000000-0000-0000-0000-000000000001', 5, true, '08:00', '17:00'),
  ('a1000000-0000-0000-0000-000000000001', 6, false,'08:00', '17:00'),
  ('a1000000-0000-0000-0000-000000000001', 7, false,'08:00', '17:00')
ON CONFLICT (salesperson_id, day_of_week) DO NOTHING;

-- Horaires pour Sophie (mer congé)
INSERT INTO public.salesperson_day_config (salesperson_id, day_of_week, active, work_start_time, work_end_time)
VALUES
  ('a1000000-0000-0000-0000-000000000002', 1, true, '08:30', '16:30'),
  ('a1000000-0000-0000-0000-000000000002', 2, true, '08:30', '16:30'),
  ('a1000000-0000-0000-0000-000000000002', 3, false,'08:30', '16:30'),
  ('a1000000-0000-0000-0000-000000000002', 4, true, '08:30', '16:30'),
  ('a1000000-0000-0000-0000-000000000002', 5, true, '08:30', '16:30'),
  ('a1000000-0000-0000-0000-000000000002', 6, false,'08:30', '16:30'),
  ('a1000000-0000-0000-0000-000000000002', 7, false,'08:30', '16:30')
ON CONFLICT (salesperson_id, day_of_week) DO NOTHING;


-- ── Clients de test ───────────────────────────────────────────────────────────
INSERT INTO public.clients (id, name, phone, email, address_formatted, city, lat, lng)
VALUES
  ('b1000000-0000-0000-0000-000000000001',
   'Marie Tremblay', '819-555-0101', 'marie@example.com',
   '456 Rue King E, Sherbrooke, QC J1G 1B1', 'Sherbrooke', 45.4044, -71.8780),
  ('b1000000-0000-0000-0000-000000000002',
   'Pierre Gagnon',  '819-555-0202', 'pierre@example.com',
   '789 Boul. Bourque, Sherbrooke, QC J1K 2C5', 'Sherbrooke', 45.3795, -71.9106),
  ('b1000000-0000-0000-0000-000000000003',
   'Lucie Côté',     '819-555-0303', null,
   '22 Rue des Cèdres, Magog, QC J1X 4A2', 'Magog', 45.2712, -72.1483),
  ('b1000000-0000-0000-0000-000000000004',
   'François Roy',   '819-555-0404', 'froy@example.com',
   '1 Rue Principale, Coaticook, QC J1A 1A1', 'Coaticook', 45.1339, -71.8006),
  ('b1000000-0000-0000-0000-000000000005',
   'Isabelle Morin', '819-555-0505', null,
   '300 Rue Du Dépôt, Fleurimont, QC J1G 4S5', 'Fleurimont', 45.4150, -71.8460)
ON CONFLICT (id) DO NOTHING;


-- ── Jobs (pipeline ventes) ────────────────────────────────────────────────────
INSERT INTO public.jobs (id, client_id, salesperson_id, status, installation_info, internal_notes, estimated_duration_hours)
VALUES
  ('c1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   'prospect', '2 thermopompes (salon + chambre maître)', 'Intéressée par Midea 12000', 4),
  ('c1000000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001',
   'soumission_en_attente', '1 thermopompe murale', 'Soumission envoyée par courriel', 4),
  ('c1000000-0000-0000-0000-000000000003',
   'b1000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000002',
   'a_relancer', 'Thermopompe + électrique', NULL, 4),
  ('c1000000-0000-0000-0000-000000000004',
   'b1000000-0000-0000-0000-000000000004',
   'a1000000-0000-0000-0000-000000000002',
   'a_planifier', '1 thermopompe split', 'Accepté verbalement — attente date', 4),
  ('c1000000-0000-0000-0000-000000000005',
   'b1000000-0000-0000-0000-000000000005',
   'a1000000-0000-0000-0000-000000000001',
   'prospect', '3 unités — grande maison', 'GPS confirmé', 4)
ON CONFLICT (id) DO NOTHING;


-- ── Rendez-vous ventes (cette semaine + semaine prochaine) ────────────────────
-- Utilise CURRENT_DATE pour rester valides dans le temps
INSERT INTO public.sales_appointments
  (id, salesperson_id, client_name, client_phone, client_address, client_lat, client_lng,
   scheduled_date, start_time, status)
VALUES
  -- Jean : lundi cette semaine 08:00
  ('d1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   'Marie Tremblay', '819-555-0101', '456 Rue King E, Sherbrooke', 45.4044, -71.8780,
   date_trunc('week', CURRENT_DATE)::date,
   '08:00', 'scheduled'),
  -- Jean : lundi cette semaine 11:00
  ('d1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001',
   'Pierre Gagnon', '819-555-0202', '789 Boul. Bourque, Sherbrooke', 45.3795, -71.9106,
   date_trunc('week', CURRENT_DATE)::date,
   '11:00', 'scheduled'),
  -- Jean : mardi 09:30
  ('d1000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000001',
   'François Roy', '819-555-0404', '1 Rue Principale, Coaticook', 45.1339, -71.8006,
   (date_trunc('week', CURRENT_DATE) + INTERVAL '1 day')::date,
   '09:30', 'scheduled'),
  -- Sophie : lundi 09:30
  ('d1000000-0000-0000-0000-000000000004',
   'a1000000-0000-0000-0000-000000000002',
   'Lucie Côté', '819-555-0303', '22 Rue des Cèdres, Magog', 45.2712, -72.1483,
   date_trunc('week', CURRENT_DATE)::date,
   '09:30', 'scheduled'),
  -- Sophie : jeudi 14:00
  ('d1000000-0000-0000-0000-000000000005',
   'a1000000-0000-0000-0000-000000000002',
   'Isabelle Morin', '819-555-0505', '300 Rue Du Dépôt, Fleurimont', 45.4150, -71.8460,
   (date_trunc('week', CURRENT_DATE) + INTERVAL '3 days')::date,
   '14:00', 'scheduled')
ON CONFLICT (id) DO NOTHING;


-- ── Prospects de test : 10 Coaticook + 10 Stoke ─────────────────────────────
-- Coaticook ~45.134 / -71.800   Stoke ~45.500 / -71.967

INSERT INTO public.clients (id, name, phone, email, address_formatted, city, lat, lng)
VALUES
  -- Coaticook
  ('e1000000-0000-0000-0000-000000000001','Robert Lafleur',    '819-849-1001',null,'14 Rue Child, Coaticook, QC J1A 2B1',   'Coaticook',45.1330,-71.8012),
  ('e1000000-0000-0000-0000-000000000002','Diane Vachon',      '819-849-1002',null,'52 Rue Main, Coaticook, QC J1A 1P3',    'Coaticook',45.1345,-71.7998),
  ('e1000000-0000-0000-0000-000000000003','Marc Beauchamp',    '819-849-1003',null,'88 Rue Jeanne-Mance, Coaticook, QC',    'Coaticook',45.1318,-71.8031),
  ('e1000000-0000-0000-0000-000000000004','Sylvie Dupuis',     '819-849-1004',null,'3 Rue Baldwin, Coaticook, QC J1A 2E4',  'Coaticook',45.1356,-71.7975),
  ('e1000000-0000-0000-0000-000000000005','Patrick Audet',     '819-849-1005',null,'120 Rue Cutting, Coaticook, QC J1A 1X5','Coaticook',45.1302,-71.8054),
  ('e1000000-0000-0000-0000-000000000006','Nathalie Bernier',  '819-849-1006',null,'77 Rue Lovell, Coaticook, QC J1A 2H2',  'Coaticook',45.1367,-71.7961),
  ('e1000000-0000-0000-0000-000000000007','Jean-Pierre Côté',  '819-849-1007',null,'41 Rue Buies, Coaticook, QC J1A 1W1',   'Coaticook',45.1290,-71.8070),
  ('e1000000-0000-0000-0000-000000000008','Manon Grenier',     '819-849-1008',null,'9 Rue Union, Coaticook, QC J1A 1T2',    'Coaticook',45.1378,-71.7944),
  ('e1000000-0000-0000-0000-000000000009','André Thibodeau',   '819-849-1009',null,'65 Rue Principale, Coaticook, QC',      'Coaticook',45.1308,-71.8089),
  ('e1000000-0000-0000-0000-000000000010','Louise Pelletier',  '819-849-1010',null,'200 Rue Craig, Coaticook, QC J1A 2P6',  'Coaticook',45.1389,-71.7930),
  -- Stoke
  ('e1000000-0000-0000-0000-000000000011','Yves Champagne',    '819-878-1001',null,'88 Chemin du Moulin, Stoke, QC J0B 3G0','Stoke',45.4992,-71.9680),
  ('e1000000-0000-0000-0000-000000000012','Carole Fortier',    '819-878-1002',null,'120 Rue Principale, Stoke, QC J0B 3G0', 'Stoke',45.5008,-71.9712),
  ('e1000000-0000-0000-0000-000000000013','Normand Boisvert',  '819-878-1003',null,'45 Chemin des Érables, Stoke, QC',      'Stoke',45.4978,-71.9651),
  ('e1000000-0000-0000-0000-000000000014','Hélène Paradis',    '819-878-1004',null,'17 Rue du Lac, Stoke, QC J0B 3G0',      'Stoke',45.5021,-71.9743),
  ('e1000000-0000-0000-0000-000000000015','Gilles Marchand',   '819-878-1005',null,'230 Chemin Stoke, Stoke, QC',           'Stoke',45.4965,-71.9625),
  ('e1000000-0000-0000-0000-000000000016','Josée Lemieux',     '819-878-1006',null,'8 Rue de l''Église, Stoke, QC',         'Stoke',45.5034,-71.9774),
  ('e1000000-0000-0000-0000-000000000017','Claude Plante',     '819-878-1007',null,'55 Route 255, Stoke, QC J0B 3G0',       'Stoke',45.4950,-71.9598),
  ('e1000000-0000-0000-0000-000000000018','Francine Boucher',  '819-878-1008',null,'180 Chemin Victoria, Stoke, QC',        'Stoke',45.5045,-71.9805),
  ('e1000000-0000-0000-0000-000000000019','Denis Langlois',    '819-878-1009',null,'32 Rue des Pins, Stoke, QC J0B 3G0',    'Stoke',45.4937,-71.9570),
  ('e1000000-0000-0000-0000-000000000020','Michelle Poirier',  '819-878-1010',null,'95 Chemin du Rang, Stoke, QC',          'Stoke',45.5058,-71.9836)
ON CONFLICT (id) DO NOTHING;

-- Jobs prospects liés
INSERT INTO public.jobs (id, client_id, status, installation_info, estimated_duration_hours)
VALUES
  ('f1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','prospect','Thermopompe murale — salon',4),
  ('f1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000002','prospect','2 unités — maison neuve',4),
  ('f1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000003','prospect','Remplacement système existant',4),
  ('f1000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000004','prospect','Thermopompe + électrique',4),
  ('f1000000-0000-0000-0000-000000000005','e1000000-0000-0000-0000-000000000005','prospect','1 unité split — sous-sol',4),
  ('f1000000-0000-0000-0000-000000000006','e1000000-0000-0000-0000-000000000006','a_suivre','Soumission envoyée verbalement',4),
  ('f1000000-0000-0000-0000-000000000007','e1000000-0000-0000-0000-000000000007','prospect','3 unités — grande propriété',4),
  ('f1000000-0000-0000-0000-000000000008','e1000000-0000-0000-0000-000000000008','a_relancer','À rappeler après les vacances',4),
  ('f1000000-0000-0000-0000-000000000009','e1000000-0000-0000-0000-000000000009','prospect','Thermopompe centrale',4),
  ('f1000000-0000-0000-0000-000000000010','e1000000-0000-0000-0000-000000000010','prospect','2 thermopompes murales',4),
  ('f1000000-0000-0000-0000-000000000011','e1000000-0000-0000-0000-000000000011','prospect','1 unité — chalet',4),
  ('f1000000-0000-0000-0000-000000000012','e1000000-0000-0000-0000-000000000012','a_suivre','Intéressé Midea 18000',4),
  ('f1000000-0000-0000-0000-000000000013','e1000000-0000-0000-0000-000000000013','prospect','Remplacement Daikin existant',4),
  ('f1000000-0000-0000-0000-000000000014','e1000000-0000-0000-0000-000000000014','prospect','2 unités — 2 étages',4),
  ('f1000000-0000-0000-0000-000000000015','e1000000-0000-0000-0000-000000000015','a_relancer','Rappeler en juillet',4),
  ('f1000000-0000-0000-0000-000000000016','e1000000-0000-0000-0000-000000000016','prospect','Thermopompe + subvention',4),
  ('f1000000-0000-0000-0000-000000000017','e1000000-0000-0000-0000-000000000017','prospect','1 unité garage chauffé',4),
  ('f1000000-0000-0000-0000-000000000018','e1000000-0000-0000-0000-000000000018','prospect','Système multi-têtes 3 zones',4),
  ('f1000000-0000-0000-0000-000000000019','e1000000-0000-0000-0000-000000000019','a_suivre','Visite faite — attente décision',4),
  ('f1000000-0000-0000-0000-000000000020','e1000000-0000-0000-0000-000000000020','prospect','Remplacement urgence — vieux système',4)
ON CONFLICT (id) DO NOTHING;

-- ── Vérification ──────────────────────────────────────────────────────────────
SELECT 'salespeople' AS table_name, count(*) FROM public.salespeople
UNION ALL
SELECT 'clients',              count(*) FROM public.clients
UNION ALL
SELECT 'jobs',                 count(*) FROM public.jobs
UNION ALL
SELECT 'sales_appointments',   count(*) FROM public.sales_appointments;
