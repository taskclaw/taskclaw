-- DB03: dag_approvals table + board_routes.trigger_on_step_complete + task_dags.approved_at

-- 1. Add approved_at to task_dags
ALTER TABLE task_dags ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- 2. Add trigger_on_step_complete to board_routes
ALTER TABLE board_routes ADD COLUMN IF NOT EXISTS trigger_on_step_complete boolean DEFAULT true;

-- 3. Create dag_approvals table
CREATE TABLE IF NOT EXISTS dag_approvals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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
        SELECT td.id FROM task_dags td
        JOIN account_users au ON au.account_id = td.account_id
        WHERE au.user_id = auth.uid() AND au.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
