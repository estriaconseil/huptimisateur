-- =============================================================================
-- Dispatch : créneaux libres après cancel / un seul schedule planned par job
-- =============================================================================

-- 0. Nettoyage préventif : garder le plus récent planned par job
DELETE FROM public.schedules a
USING public.schedules b
WHERE a.status = 'planned'
  AND b.status = 'planned'
  AND a.job_id = b.job_id
  AND (
    a.created_at < b.created_at
    OR (a.created_at = b.created_at AND a.id::text < b.id::text)
  );

-- 1. Garde-fou AM/PM/full_day : ignore les schedules annulés (comme ventes)
CREATE OR REPLACE FUNCTION public.schedules_team_date_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF new.slot_type = 'full_day' THEN
    IF EXISTS (
      SELECT 1 FROM public.schedules s
      WHERE s.team_id = new.team_id
        AND s.scheduled_date = new.scheduled_date
        AND s.status <> 'cancelled'
        AND s.id IS DISTINCT FROM new.id
    ) THEN
      RAISE EXCEPTION 'Cette équipe a déjà une affectation ce jour-là';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.schedules s
      WHERE s.team_id = new.team_id
        AND s.scheduled_date = new.scheduled_date
        AND s.slot_type = 'full_day'
        AND s.status <> 'cancelled'
        AND s.id IS DISTINCT FROM new.id
    ) THEN
      RAISE EXCEPTION 'La journée est bloquée (intervention longue)';
    END IF;
    IF new.slot_type = 'am' THEN
      IF EXISTS (
        SELECT 1 FROM public.schedules s
        WHERE s.team_id = new.team_id
          AND s.scheduled_date = new.scheduled_date
          AND s.slot_type = 'am'
          AND s.status <> 'cancelled'
          AND s.id IS DISTINCT FROM new.id
      ) THEN
        RAISE EXCEPTION 'Le créneau AM est déjà pris';
      END IF;
    ELSIF new.slot_type = 'pm' THEN
      IF EXISTS (
        SELECT 1 FROM public.schedules s
        WHERE s.team_id = new.team_id
          AND s.scheduled_date = new.scheduled_date
          AND s.slot_type = 'pm'
          AND s.status <> 'cancelled'
          AND s.id IS DISTINCT FROM new.id
      ) THEN
        RAISE EXCEPTION 'Le créneau PM est déjà pris';
      END IF;
    END IF;
  END IF;
  RETURN new;
END;
$$;

-- 2. Une job ne peut avoir qu'un seul créneau « planned » (anti-doublon déplacement)
CREATE UNIQUE INDEX IF NOT EXISTS schedules_one_planned_per_job
  ON public.schedules (job_id)
  WHERE status = 'planned';
