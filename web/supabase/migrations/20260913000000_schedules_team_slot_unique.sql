-- =============================================================================
-- Anti double-booking install : unique partiel sur créneau équipe (comme ventes)
-- Le trigger schedules_team_date_guard reste pour full_day vs am/pm.
-- =============================================================================

-- Nettoyage : doublons exacts (même équipe / date / slot_type, non annulés)
DELETE FROM public.schedules a
USING public.schedules b
WHERE a.status <> 'cancelled'
  AND b.status <> 'cancelled'
  AND a.team_id = b.team_id
  AND a.scheduled_date = b.scheduled_date
  AND a.slot_type = b.slot_type
  AND a.id <> b.id
  AND (
    a.created_at < b.created_at
    OR (a.created_at = b.created_at AND a.id::text < b.id::text)
  );

CREATE UNIQUE INDEX IF NOT EXISTS schedules_team_slot_unique
  ON public.schedules (team_id, scheduled_date, slot_type)
  WHERE status <> 'cancelled';
