-- Partial index for stale task reconciler performance
-- Covers the frequent query: WHERE status = 'running' AND updated_at < NOW() - INTERVAL '10 minutes'

CREATE INDEX IF NOT EXISTS idx_orchestrated_tasks_stale
  ON orchestrated_tasks(status, updated_at)
  WHERE status = 'running';
