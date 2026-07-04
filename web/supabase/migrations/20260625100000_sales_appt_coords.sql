-- Ajoute les coordonnées GPS aux rendez-vous de vente
-- Nécessaire pour l'optimiseur de créneaux (distance prev/next)
-- Note: deux ALTER TABLE séparés pour éviter un bug du SQL Editor Supabase
--       qui interprète le multi-ADD COLUMN comme des statements distincts.

ALTER TABLE public.sales_appointments ADD COLUMN IF NOT EXISTS client_lat DOUBLE PRECISION;
ALTER TABLE public.sales_appointments ADD COLUMN IF NOT EXISTS client_lng DOUBLE PRECISION;
