-- M04: Add result and dag_id columns to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dag_id uuid REFERENCES task_dags(id) ON DELETE SET NULL;
