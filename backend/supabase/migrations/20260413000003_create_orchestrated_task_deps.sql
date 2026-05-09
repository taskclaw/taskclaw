-- F002: Create orchestrated_task_deps table for DAG dependency tracking
CREATE TABLE IF NOT EXISTS orchestrated_task_deps (
  upstream_task_id   UUID NOT NULL REFERENCES orchestrated_tasks(id) ON DELETE CASCADE,
  downstream_task_id UUID NOT NULL REFERENCES orchestrated_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (upstream_task_id, downstream_task_id),
  CHECK (upstream_task_id != downstream_task_id)
);

CREATE INDEX IF NOT EXISTS idx_orchestrated_task_deps_downstream
  ON orchestrated_task_deps(downstream_task_id);
