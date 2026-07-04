-- Ajoute le courriel client aux rendez-vous de vente
-- Capturé lors de la création rapide depuis le calendrier (onglet Nouveau client)

ALTER TABLE public.sales_appointments ADD COLUMN IF NOT EXISTS client_email TEXT;
