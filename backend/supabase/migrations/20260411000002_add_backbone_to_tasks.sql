-- Add backbone_connection_id to tasks for task-level backbone override
-- Priority cascade: Task > Step (Column) > Board > Agent (Category) > Account Default

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS backbone_connection_id UUID
  REFERENCES backbone_connections(id) ON DELETE SET NULL;
