-- M01: Create agents table (F01 - Agents as First-Class Team Members)
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Identity
  name varchar(100) NOT NULL,
  slug varchar(100) NOT NULL,
  avatar_url text,
  description text,
  persona text,
  color varchar(7),

  -- Configuration
  backbone_connection_id uuid REFERENCES backbone_connections(id) ON DELETE SET NULL,
  model_override varchar(100),
  max_concurrent_tasks integer DEFAULT 3,

  -- State
  status varchar(20) NOT NULL DEFAULT 'idle',
  is_active boolean NOT NULL DEFAULT true,

  -- Type
  agent_type varchar(20) NOT NULL DEFAULT 'worker',

  -- Tracking
  total_tasks_completed integer DEFAULT 0,
  total_tasks_failed integer DEFAULT 0,
  total_tokens_used bigint DEFAULT 0,
  last_active_at timestamptz,

  -- Metadata
  config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Migration traceability (dropped in Phase 5)
  migrated_from_category_id uuid,

  CONSTRAINT agents_unique_slug_per_account UNIQUE (account_id, slug),
  CONSTRAINT agents_status_check CHECK (status IN ('idle', 'working', 'paused', 'error', 'offline')),
  CONSTRAINT agents_type_check CHECK (agent_type IN ('worker', 'pilot', 'coordinator'))
);

CREATE INDEX IF NOT EXISTS idx_agents_account_id ON agents(account_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(account_id, status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agents_migrated_from_category ON agents(migrated_from_category_id) WHERE migrated_from_category_id IS NOT NULL;

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see agents in their accounts" ON agents
    FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage agents" ON agents
    FOR ALL USING (EXISTS (
      SELECT 1 FROM account_users
      WHERE account_users.account_id = agents.account_id
        AND account_users.user_id = auth.uid()
        AND account_users.role IN ('owner', 'admin')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
