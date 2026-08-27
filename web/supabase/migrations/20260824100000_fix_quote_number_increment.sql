-- Numérotation soumissions : base par année (2026 → 60000) puis +1 atomique via séquence.
-- get_next_quote_number() CONSOMME un numéro — à appeler uniquement à la création.
-- L'aperçu UI doit calculer MAX+1 sans appeler cette fonction (voir allocate vs peek côté app).

CREATE OR REPLACE FUNCTION public.get_next_quote_number()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr text;
  base_num integer;
  next_base integer;
  ceiling_num integer;
  max_in_range integer;
  bases jsonb;
  next_num integer;
BEGIN
  yr := to_char(current_date, 'YYYY');

  SELECT quote_number_bases INTO bases FROM app_settings LIMIT 1;
  IF bases IS NULL THEN
    bases := '{"2026":60000,"2027":70000}'::jsonb;
  END IF;

  base_num := (bases ->> yr)::integer;
  IF base_num IS NULL THEN
    RETURN nextval('public.quote_number_seq')::INTEGER;
  END IF;

  next_base := (bases ->> (yr::integer + 1)::text)::integer;
  ceiling_num := COALESCE(next_base, base_num + 10000);

  -- Verrou : une seule allocation à la fois pour l'année
  PERFORM pg_advisory_xact_lock(hashtext('quote_number_' || yr));

  SELECT MAX(quote_number)
  INTO max_in_range
  FROM quotes
  WHERE quote_number >= base_num
    AND quote_number < ceiling_num;

  -- Positionne la séquence juste avant le prochain n° (base ou MAX+1)
  PERFORM setval(
    'public.quote_number_seq',
    GREATEST(base_num - 1, COALESCE(max_in_range, base_num - 1)),
    true
  );

  next_num := nextval('public.quote_number_seq')::INTEGER;

  IF next_num >= ceiling_num THEN
    RAISE EXCEPTION 'Plage de numéros épuisée pour l''année % (base %, plafond %)', yr, base_num, ceiling_num;
  END IF;

  RETURN next_num;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_quote_number() TO authenticated;

-- Base 2026 = 60000 si manquante
UPDATE public.app_settings
SET quote_number_bases = COALESCE(quote_number_bases, '{}'::jsonb) || '{"2026":60000,"2027":70000}'::jsonb
WHERE quote_number_bases IS NULL
   OR NOT (quote_number_bases ? '2026');

-- Aligner la séquence sur la base 2026 si elle est encore en bas (ex. 30001)
SELECT setval(
  'public.quote_number_seq',
  GREATEST(
    59999,
    COALESCE((SELECT MAX(quote_number) FROM quotes WHERE quote_number >= 60000 AND quote_number < 70000), 59999),
    (SELECT last_value FROM public.quote_number_seq)
  ),
  true
);
