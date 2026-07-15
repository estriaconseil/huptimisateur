-- Nouveau statut pipeline : En attente (soumission avec montant > 0)
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'en_attente' AFTER 'soumission_repartie';
