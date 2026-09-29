-- =============================================================================
-- team_blocks : ajout group_id pour permettre la suppression par période
-- =============================================================================

ALTER TABLE public.team_blocks
  ADD COLUMN IF NOT EXISTS group_id uuid;

-- Index pour accélérer DELETE/SELECT par groupe
CREATE INDEX IF NOT EXISTS team_blocks_group_idx
  ON public.team_blocks (group_id)
  WHERE group_id IS NOT NULL;
