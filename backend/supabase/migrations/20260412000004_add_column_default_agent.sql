-- F03: Add default_agent_id to board_steps table, replacing linked_category_id role
ALTER TABLE board_steps
  ADD COLUMN IF NOT EXISTS default_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_board_steps_default_agent ON board_steps(default_agent_id)
  WHERE default_agent_id IS NOT NULL;

-- Migration: map existing linked_category_id -> default_agent_id via agents.migrated_from_category_id
UPDATE board_steps bs
SET default_agent_id = a.id
FROM agents a
WHERE a.migrated_from_category_id = bs.linked_category_id
  AND bs.linked_category_id IS NOT NULL
  AND bs.default_agent_id IS NULL;
