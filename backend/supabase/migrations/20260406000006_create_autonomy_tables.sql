-- M06: Create heartbeat_configs and execution_log tables
CREATE TABLE IF NOT EXISTS heartbeat_configs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pod_id uuid REFERENCES pods(id) ON DELETE CASCADE,
  board_id uuid REFERENCES board_instances(id) ON DELETE CASCADE,
  name text NOT NULL,
  schedule text NOT NULL DEFAULT '0 */4 * * *',
  prompt text NOT NULL DEFAULT 'Review pending tasks and take appropriate actions.',
  is_active boolean DEFAULT false,
  dry_run boolean DEFAULT false,
  max_tasks_per_run integer DEFAULT 5,
  circuit_breaker_threshold integer DEFAULT 3,
  consecutive_failures integer DEFAULT 0,
  last_run_at timestamptz,
  last_run_status text CHECK (last_run_status IN ('success', 'error', 'skipped', 'running')),
  last_run_summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_heartbeat_configs_account ON heartbeat_configs(account_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_configs_active ON heartbeat_configs(is_active) WHERE is_active = true;
ALTER TABLE heartbeat_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users see heartbeats in their workspaces" ON heartbeat_configs FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage heartbeats" ON heartbeat_configs FOR ALL USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = heartbeat_configs.account_id AND account_users.user_id = auth.uid() AND account_users.role IN ('owner', 'admin'))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS execution_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('heartbeat', 'dag_step', 'route_transfer', 'tool_execution', 'coordinator', 'manual')),
  status text NOT NULL CHECK (status IN ('success', 'error', 'skipped', 'running', 'timeout', 'dry_run')),
  pod_id uuid REFERENCES pods(id) ON DELETE SET NULL,
  board_id uuid REFERENCES board_instances(id) ON DELETE SET NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  dag_id uuid REFERENCES task_dags(id) ON DELETE SET NULL,
  heartbeat_config_id uuid REFERENCES heartbeat_configs(id) ON DELETE SET NULL,
  route_id uuid REFERENCES board_routes(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  summary text,
  error_details text,
  duration_ms integer,
  metadata jsonb DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_execution_log_account ON execution_log(account_id);
CREATE INDEX IF NOT EXISTS idx_execution_log_started ON execution_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_log_pod ON execution_log(pod_id);
ALTER TABLE execution_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users see execution logs in their workspaces" ON execution_log FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
