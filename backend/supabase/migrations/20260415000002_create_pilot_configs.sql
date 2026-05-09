-- DB03: dag_approvals table + board_routes.trigger_on_step_complete column
-- DB04: pilot_configs table

-- ============================================================
-- DB03: dag_approvals + board_routes column
-- ============================================================

CREATE TABLE IF NOT EXISTS dag_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dag_id uuid NOT NULL REFERENCES task_dags(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dag_approvals_dag ON dag_approvals(dag_id);
CREATE INDEX IF NOT EXISTS idx_dag_approvals_status ON dag_approvals(status);

ALTER TABLE dag_approvals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see approvals in their workspaces" ON dag_approvals
    FOR SELECT USING (
      dag_id IN (
        SELECT id FROM task_dags WHERE account_id IN (SELECT get_auth_user_account_ids())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage dag approvals" ON dag_approvals
    FOR ALL USING (
      dag_id IN (
        SELECT id FROM task_dags WHERE account_id IN (
          SELECT au.account_id FROM account_users au
          WHERE au.user_id = auth.uid() AND au.role IN ('owner', 'admin')
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add approved_at to task_dags
ALTER TABLE task_dags ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Add trigger_on_step_complete to board_routes
ALTER TABLE board_routes ADD COLUMN IF NOT EXISTS trigger_on_step_complete boolean NOT NULL DEFAULT true;

-- ============================================================
-- DB04: pilot_configs
-- ============================================================

CREATE TABLE IF NOT EXISTS pilot_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pod_id uuid REFERENCES pods(id) ON DELETE CASCADE,
  backbone_connection_id uuid REFERENCES backbone_connections(id) ON DELETE SET NULL,
  system_prompt text,
  is_active boolean NOT NULL DEFAULT false,
  max_tasks_per_cycle int NOT NULL DEFAULT 10,
  approval_required boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_run_summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Only one pilot config per account+pod combination (NULL pod = workspace-level)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_configs_account_pod
  ON pilot_configs(account_id, pod_id)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_pilot_configs_account ON pilot_configs(account_id);
CREATE INDEX IF NOT EXISTS idx_pilot_configs_active ON pilot_configs(is_active) WHERE is_active = true;

ALTER TABLE pilot_configs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see pilot configs in their workspaces" ON pilot_configs
    FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage pilot configs" ON pilot_configs
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM account_users
        WHERE account_users.account_id = pilot_configs.account_id
          AND account_users.user_id = auth.uid()
          AND account_users.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
