-- Fonction sécurisée pour réserver atomiquement le prochain numéro de soumission.
-- Appelée au chargement du formulaire de soumission (avant la sauvegarde).
-- Utilise nextval() : chaque appel retourne un numéro UNIQUE garanti par PostgreSQL.
-- Les numéros non utilisés (formulaire abandonné) créent des trous — c'est acceptable.

CREATE OR REPLACE FUNCTION public.get_next_quote_number()
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('public.quote_number_seq')::INTEGER;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_quote_number() TO authenticated;
