-- M01: Create pods table
CREATE TABLE IF NOT EXISTS pods (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  icon text DEFAULT 'layers',
  color text DEFAULT '#6366f1',
  backbone_connection_id uuid REFERENCES backbone_connections(id) ON DELETE SET NULL,
  agent_config jsonb DEFAULT '{}',
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (account_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_pods_account ON pods(account_id);
ALTER TABLE pods ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users see pods in their workspaces" ON pods FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins can manage pods" ON pods FOR ALL USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = pods.account_id AND account_users.user_id = auth.uid() AND account_users.role IN ('owner', 'admin')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
