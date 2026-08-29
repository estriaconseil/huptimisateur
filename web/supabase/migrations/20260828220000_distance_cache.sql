-- Cache persistant Distance Matrix (14 jours)
-- Clé : paire origine/destination arrondie à 4 décimales (~11 m de précision)
CREATE TABLE IF NOT EXISTS distance_cache (
  o_lat4     numeric(9, 4)  NOT NULL,
  o_lng4     numeric(9, 4)  NOT NULL,
  d_lat4     numeric(9, 4)  NOT NULL,
  d_lng4     numeric(9, 4)  NOT NULL,
  mode       text           NOT NULL DEFAULT 'driving',
  minutes    numeric,
  meters     integer,
  created_at timestamptz    NOT NULL DEFAULT now(),
  PRIMARY KEY (o_lat4, o_lng4, d_lat4, d_lng4, mode)
);

-- RLS activé, aucune policy → accès refusé pour anon/authenticated.
-- Le service role (createAdminSupabaseClient) bypasse RLS automatiquement.
ALTER TABLE distance_cache ENABLE ROW LEVEL SECURITY;

-- Index pour le TTL cleanup
CREATE INDEX IF NOT EXISTS distance_cache_created_at_idx ON distance_cache (created_at);

-- Fonction de nettoyage (lancée manuellement ou en cron)
CREATE OR REPLACE FUNCTION purge_distance_cache(ttl_days int DEFAULT 14)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  deleted int;
BEGIN
  DELETE FROM distance_cache WHERE created_at < now() - (ttl_days || ' days')::interval;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;
