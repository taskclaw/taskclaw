-- F001: Create orchestrated_tasks table for full hierarchical orchestration engine
CREATE TABLE IF NOT EXISTS orchestrated_tasks (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pod_id                       UUID REFERENCES pods(id) ON DELETE SET NULL,
  parent_orchestrated_task_id  UUID REFERENCES orchestrated_tasks(id) ON DELETE CASCADE,
  goal                         TEXT NOT NULL,
  input_context                JSONB DEFAULT '{}',
  status                       TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'pending', 'running', 'completed', 'failed', 'cancelled')),
  autonomy_level               INT NOT NULL DEFAULT 1
    CHECK (autonomy_level BETWEEN 1 AND 4),
  result_summary               TEXT,
  structured_output            JSONB,
  metadata                     JSONB DEFAULT '{}',
  created_at                   TIMESTAMPTZ DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orchestrated_tasks_account_status
  ON orchestrated_tasks(account_id, status);

CREATE INDEX IF NOT EXISTS idx_orchestrated_tasks_pod_id
  ON orchestrated_tasks(pod_id);

CREATE INDEX IF NOT EXISTS idx_orchestrated_tasks_parent_id
  ON orchestrated_tasks(parent_orchestrated_task_id);

ALTER TABLE orchestrated_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see orchestrated tasks in their accounts" ON orchestrated_tasks
    FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage orchestrated tasks" ON orchestrated_tasks
    FOR ALL USING (EXISTS (
      SELECT 1 FROM account_users
      WHERE account_users.account_id = orchestrated_tasks.account_id
        AND account_users.user_id = auth.uid()
        AND account_users.role IN ('owner', 'admin')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
