-- F02: Add FK constraint from tasks.assignee_id to agents
-- This enables the PostgREST join syntax: agents!assignee_id(id, name, color, avatar_url)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'tasks_assignee_id_fkey' AND table_name = 'tasks'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_id_fkey 
      FOREIGN KEY (assignee_id) REFERENCES agents(id) ON DELETE SET NULL;
  END IF;
END $$;
