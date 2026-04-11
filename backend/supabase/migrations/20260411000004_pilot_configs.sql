-- DB04: pilot_configs table

CREATE TABLE IF NOT EXISTS pilot_configs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pod_id uuid REFERENCES pods(id) ON DELETE CASCADE,
  backbone_connection_id uuid REFERENCES backbone_connections(id) ON DELETE SET NULL,
  system_prompt text NOT NULL DEFAULT 'You are a project coordinator. Review the current state of tasks and boards, then suggest and execute actions to move work forward.',
  is_active boolean NOT NULL DEFAULT false,
  max_tasks_per_cycle integer NOT NULL DEFAULT 10,
  approval_required boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_run_summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique: one workspace-level pilot (pod_id IS NULL) per account,
-- and one pod-level pilot per (account, pod)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_configs_unique
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
