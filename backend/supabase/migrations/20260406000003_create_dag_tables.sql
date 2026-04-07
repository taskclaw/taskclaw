-- M03: Create board_routes, task_dags, task_dependencies tables
CREATE TABLE IF NOT EXISTS board_routes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_board_id uuid NOT NULL REFERENCES board_instances(id) ON DELETE CASCADE,
  source_step_id uuid REFERENCES board_steps(id) ON DELETE SET NULL,
  target_board_id uuid NOT NULL REFERENCES board_instances(id) ON DELETE CASCADE,
  target_step_id uuid REFERENCES board_steps(id) ON DELETE SET NULL,
  trigger text NOT NULL DEFAULT 'auto' CHECK (trigger IN ('auto', 'ai_decision', 'manual')),
  transform_config jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_board_routes_account ON board_routes(account_id);
CREATE INDEX IF NOT EXISTS idx_board_routes_source ON board_routes(source_board_id);
ALTER TABLE board_routes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users see routes in their workspaces" ON board_routes FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage routes" ON board_routes FOR ALL USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = board_routes.account_id AND account_users.user_id = auth.uid() AND account_users.role IN ('owner', 'admin'))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS task_dags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pod_id uuid REFERENCES pods(id) ON DELETE SET NULL,
  goal text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending_approval', 'pending', 'running', 'completed', 'failed', 'cancelled')),
  created_by text NOT NULL DEFAULT 'human',
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_task_dags_account ON task_dags(account_id);
ALTER TABLE task_dags ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users see DAGs in their workspaces" ON task_dags FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS task_dependencies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  target_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'dag' CHECK (dependency_type IN ('route', 'dag', 'manual')),
  route_id uuid REFERENCES board_routes(id) ON DELETE SET NULL,
  dag_id uuid REFERENCES task_dags(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_deps_source ON task_dependencies(source_task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_target ON task_dependencies(target_task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_dag ON task_dependencies(dag_id);
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users see deps for their tasks" ON task_dependencies FOR SELECT USING (source_task_id IN (SELECT id FROM tasks WHERE account_id IN (SELECT get_auth_user_account_ids()))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
