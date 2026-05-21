-- ============================================================
-- DONNÉES DE TEST — 20 clients/jobs Coaticook & Windsor QC
-- À exécuter dans Supabase SQL Editor
-- ============================================================

do $$
declare
  c_id uuid;
begin

  -- ── COATICOOK (10 clients) ──────────────────────────────

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Martin Beauchamp', '819-849-1122', 'martin.beauchamp@email.com', '125 rue Child, Coaticook, QC J1A 1H4', 'Coaticook', 'J1A 1H4', 45.1730, -71.7995)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Installation climatiseur mural — salon 18x20', 4, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Sylvie Trottier', '819-849-3344', null, '78 rue Main, Coaticook, QC J1A 2B1', 'Coaticook', 'J1A 2B1', 45.1745, -71.8012)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Remplacement thermopompe centrale — maison 1200 pi²', 8, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Jean-François Lapointe', '819-849-5566', 'jf.lapointe@gmail.com', '45 rue Saint-Jean-Baptiste, Coaticook, QC J1A 1T6', 'Coaticook', 'J1A 1T6', 45.1758, -71.8021)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Entretien annuel thermopompe + vérification réfrigérant', 4, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Isabelle Roy', '819-849-7788', 'isabelle.roy@hotmail.com', '210 rue Lovell, Coaticook, QC J1A 1W2', 'Coaticook', 'J1A 1W2', 45.1712, -71.7978)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Installation 2 climatiseurs muraux — chambre + bureau', 8, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Pierre Gosselin', '819-849-9900', null, '33 rue Speid, Coaticook, QC J1A 2C4', 'Coaticook', 'J1A 2C4', 45.1768, -71.8045)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Bruit anormal compresseur — inspection complète', 4, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Marie-Claude Fontaine', '819-849-2211', 'mc.fontaine@videotron.ca', '155 rue Baldwin, Coaticook, QC J1A 1P3', 'Coaticook', 'J1A 1P3', 45.1722, -71.8034)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Thermopompe ne chauffe plus — appel de service urgent', 4, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Luc Desmarais', '819-849-4433', 'luc.desmarais@gmail.com', '88 rue Church, Coaticook, QC J1A 2A7', 'Coaticook', 'J1A 2A7', 45.1750, -71.7963)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Installation climatiseur commercial — salle de conférence', 8, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Nathalie Vézina', '819-849-6655', null, '17 chemin Bowen, Coaticook, QC J1A 2E1', 'Coaticook', 'J1A 2E1', 45.1695, -71.7989)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Remplacement filtre + nettoyage serpentin évaporateur', 4, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Robert Champagne', '819-849-8877', 'r.champagne@cooptel.qc.ca', '62 rue Norton, Coaticook, QC J1A 1R5', 'Coaticook', 'J1A 1R5', 45.1738, -71.8018)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Nouvelle installation thermopompe — construction neuve', 8, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Chantal Bergeron', '819-849-0099', 'chantal.b@outlook.com', '301 rue Young, Coaticook, QC J1A 2G3', 'Coaticook', 'J1A 2G3', 45.1705, -71.8060)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Perte de fréon — vérification étanchéité + recharge', 4, 'draft');

  -- ── WINDSOR (10 clients) ────────────────────────────────

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Gilles Pouliot', '819-845-1234', 'gilles.pouliot@gmail.com', '125 rue Saint-Georges, Windsor, QC J1S 2W5', 'Windsor', 'J1S 2W5', 45.5638, -71.9923)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Installation thermopompe murale — salon principal', 4, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Diane Marchand', '819-845-5678', null, '78 rue Principale, Windsor, QC J1S 1B3', 'Windsor', 'J1S 1B3', 45.5652, -71.9908)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Remplacement thermopompe centrale tombée en panne', 8, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('André Chouinard', '819-845-9012', 'andre.chouinard@videotron.ca', '45 rue Bloom, Windsor, QC J1S 2R1', 'Windsor', 'J1S 2R1', 45.5621, -71.9941)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Entretien préventif annuel — 2 appareils', 4, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Josée Cloutier', '819-845-3456', 'josee.cloutier@hotmail.com', '189 rue Miner, Windsor, QC J1S 1E7', 'Windsor', 'J1S 1E7', 45.5665, -71.9885)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Installation split — chambre maître + chambre secondaire', 8, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Mario Fleury', '819-845-7890', null, '23 rue Saint-Laurent, Windsor, QC J1S 2K4', 'Windsor', 'J1S 2K4', 45.5609, -71.9955)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Fuite eau condensation — inspection drain + plateau', 4, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Linda Boisvert', '819-845-2345', 'linda.boisvert@gmail.com', '55 rue des Érables, Windsor, QC J1S 2P8', 'Windsor', 'J1S 2P8', 45.5644, -71.9872)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Climatiseur mural — mauvais dégivrage en mode chauffage', 4, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('François Leblanc', '819-845-6789', 'f.leblanc@cooptel.qc.ca', '144 rue du Moulin, Windsor, QC J1S 1G2', 'Windsor', 'J1S 1G2', 45.5628, -71.9930)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Installation thermopompe — maison centenaire rénovée', 8, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Manon Girard', '819-845-0123', null, '37 rue Windsor, Windsor, QC J1S 2T6', 'Windsor', 'J1S 2T6', 45.5657, -71.9897)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Bruit sifflement unité extérieure — diagnostic compresseur', 4, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Réal Thibodeau', '819-845-4567', 'real.thibodeau@outlook.com', '92 rue Gouin, Windsor, QC J1S 1K9', 'Windsor', 'J1S 1K9', 45.5616, -71.9948)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Remplacement condensateur unité extérieure', 4, 'draft');

  insert into clients (name, phone, email, address_formatted, city, postal_code, lat, lng)
  values ('Céline Dupont', '819-845-8901', 'celine.dupont@gmail.com', '208 chemin des Pins, Windsor, QC J1S 2X3', 'Windsor', 'J1S 2X3', 45.5598, -71.9966)
  returning id into c_id;
  insert into jobs (client_id, installation_info, estimated_duration_hours, status)
  values (c_id, 'Installation 3 têtes murales — maison unifamiliale neuve', 8, 'draft');

end $$;
