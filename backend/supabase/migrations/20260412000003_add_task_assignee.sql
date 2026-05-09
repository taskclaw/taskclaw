-- F02: Add polymorphic assignee fields to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS assignee_type varchar(10) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS assignee_id uuid;

-- Add CHECK constraint for valid assignee_type values
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_type_check
    CHECK (assignee_type IN ('none', 'agent', 'human'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Partial indexes for fast lookup by assignee
CREATE INDEX IF NOT EXISTS idx_tasks_agent_assignee ON tasks(assignee_id)
  WHERE assignee_type = 'agent';
CREATE INDEX IF NOT EXISTS idx_tasks_human_assignee ON tasks(assignee_id)
  WHERE assignee_type = 'human';

-- Backfill: for tasks in columns that have a default_agent_id (via agent migration),
-- set assignee_type='agent' and assignee_id from the migrated agent.
-- Only backfills tasks where the column's category maps to a known agent.
UPDATE tasks t
SET
  assignee_type = 'agent',
  assignee_id = a.id
FROM board_steps bs
JOIN agents a ON a.migrated_from_category_id = bs.linked_category_id
WHERE t.current_step_id = bs.id
  AND t.assignee_type = 'none'
  AND bs.linked_category_id IS NOT NULL
  AND a.migrated_from_category_id IS NOT NULL;
