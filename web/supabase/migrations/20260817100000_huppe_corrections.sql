-- Lot 1 + 2 : champs unité
ALTER TABLE quote_units
  ADD COLUMN IF NOT EXISTS serial_evaporator text,
  ADD COLUMN IF NOT EXISTS operating_temp_c smallint,
  ADD COLUMN IF NOT EXISTS floor_mount_other text;

-- Lot 3 : bases de numéros par année (jsonb : {"2026":60000,"2027":70000})
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS quote_number_bases jsonb NOT NULL DEFAULT '{"2026":60000,"2027":70000}'::jsonb;

-- RPC atomique : prochain numéro selon l'année courante
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
  next_num integer;
  bases jsonb;
BEGIN
  yr := to_char(current_date, 'YYYY');
  SELECT quote_number_bases INTO bases FROM app_settings LIMIT 1;
  IF bases IS NULL THEN
    bases := '{"2026":60000,"2027":70000}'::jsonb;
  END IF;

  base_num := (bases ->> yr)::integer;
  IF base_num IS NULL THEN
    -- Année non configurée : fallback séquence legacy
    RETURN nextval('public.quote_number_seq')::INTEGER;
  END IF;

  -- Plafond = base de l'année suivante ou base + 10000
  next_base := (bases ->> (yr::integer + 1)::text)::integer;
  ceiling_num := COALESCE(next_base, base_num + 10000);

  PERFORM pg_advisory_xact_lock(hashtext('quote_number_' || yr));

  SELECT COALESCE(MAX(quote_number), base_num - 1) + 1
  INTO next_num
  FROM quotes
  WHERE quote_number >= base_num AND quote_number < ceiling_num;

  IF next_num >= ceiling_num THEN
    RAISE EXCEPTION 'Plage de numéros épuisée pour l''année %', yr;
  END IF;

  RETURN next_num;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_quote_number() TO authenticated;
