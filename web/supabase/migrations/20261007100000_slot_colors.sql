-- Couleur de fond personnalisable dans le calendrier d'installation
-- Demande du 7 oct 2026 (Ian / Sonia / Stéphane)
-- Valeurs possibles (gérées côté app) :
--   rose      → RDV non confirmé / équipements non reçus
--   blue_dark → Projet multi-logements
--   blue_pale → Requiert plus d'une équipe
--   green     → Un technicien est absent
--   yellow    → Attention particulière
--   red       → Réservée pour un contracteur général
--   charcoal  → Équipe non disponible

ALTER TABLE public.team_blocks
  ADD COLUMN IF NOT EXISTS color TEXT;

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS color TEXT;
