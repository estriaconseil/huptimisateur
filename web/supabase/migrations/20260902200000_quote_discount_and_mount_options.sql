-- Retours tests Stéphane (août 2026) : rabais avant taxes + options montage multi-sélection

ALTER TABLE quote_units
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE quote_units
  ADD COLUMN IF NOT EXISTS mount_options TEXT[] NOT NULL DEFAULT '{}';

-- Migrer support_type / floor_mount_type existants vers mount_options
UPDATE quote_units
SET mount_options = ARRAY(
  SELECT v FROM unnest(ARRAY[support_type, floor_mount_type]) AS v
  WHERE v IS NOT NULL AND v <> ''
)
WHERE mount_options = '{}' OR mount_options IS NULL;
