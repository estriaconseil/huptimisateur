-- Sépare la note de visite de vente (sales_note) des infos d'installation pour les techniciens (installation_info).
-- sales_note  : visible dans le pipeline ventes, le calendrier ventes, et sur la tuile RDV.
-- installation_info : reste inchangé pour le dispatch et les techniciens.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS sales_note TEXT;
