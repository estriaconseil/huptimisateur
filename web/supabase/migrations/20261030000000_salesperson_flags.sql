-- Migration U1+U2 : séparer "peut faire des soumissions" et "disponible RDV/optimisateur"
--
-- AVANT : un seul flag `active`
--   active = true  → calendrier + optimisateur + sélecteur soumission
--   active = false → invisible partout
--
-- APRÈS : deux flags indépendants
--   can_quote                   → apparaît dans le sélecteur représentant des soumissions
--   available_for_appointments  → calendrier ventes + optimisateur de créneaux
--
-- `active` est CONSERVÉ en base (rétrocompatibilité) mais n'est plus utilisé par l'app.
-- Il reste à TRUE pour les vendeurs actifs et est ignoré.

-- ── 1. Ajout des colonnes ─────────────────────────────────────────────────────
ALTER TABLE public.salespeople
  ADD COLUMN IF NOT EXISTS can_quote                  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS available_for_appointments BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Initialisation depuis active ──────────────────────────────────────────
-- Tous ceux qui étaient actifs → les deux flags à true
UPDATE public.salespeople
SET
  can_quote                  = active,
  available_for_appointments = active;

-- ── 3. Index pour les requêtes de filtrage ────────────────────────────────────
CREATE INDEX IF NOT EXISTS salespeople_can_quote_idx
  ON public.salespeople (can_quote);

CREATE INDEX IF NOT EXISTS salespeople_available_for_appts_idx
  ON public.salespeople (available_for_appointments);

-- ── Notes post-migration ──────────────────────────────────────────────────────
-- Après déploiement, aller dans Équipes → Vendeurs et :
--   - Pour les directeurs (Stéphane, Denis, Ghislain si directeur) :
--       cocher "Peut faire des soumissions" + décocher "Disponible RDV"
--   - Pour les 2 reps optimisés : laisser les deux cochés
