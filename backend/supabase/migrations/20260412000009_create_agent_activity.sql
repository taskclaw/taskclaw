-- F08: Create agent_activity table
CREATE TABLE IF NOT EXISTS agent_activity (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  activity_type   varchar(30) NOT NULL,
  -- task_completed | task_failed | task_assigned | conversation_reply |
  -- dag_created | route_triggered | status_changed | error

  task_id         uuid REFERENCES tasks(id) ON DELETE SET NULL,
  dag_id          uuid REFERENCES task_dags(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  board_id        uuid REFERENCES board_instances(id) ON DELETE SET NULL,

  summary         text NOT NULL,
  metadata        jsonb DEFAULT '{}',

  created_at      timestamptz DEFAULT now()
);

ALTER TABLE agent_activity ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see agent_activity in their accounts" ON agent_activity
    FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service can insert agent_activity" ON agent_activity
    FOR INSERT WITH CHECK (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_account ON agent_activity(account_id, created_at DESC);

-- Add increment_agent_stats RPC function for atomic counter updates
CREATE OR REPLACE FUNCTION increment_agent_stats(
  p_agent_id uuid,
  p_completed_delta integer,
  p_failed_delta integer,
  p_tokens_delta bigint
) RETURNS void AS $$
BEGIN
  UPDATE agents
  SET
    total_tasks_completed = total_tasks_completed + p_completed_delta,
    total_tasks_failed    = total_tasks_failed + p_failed_delta,
    total_tokens_used     = total_tokens_used + p_tokens_delta,
    last_active_at        = CASE WHEN p_completed_delta > 0 OR p_failed_delta > 0
                              THEN now() ELSE last_active_at END
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
