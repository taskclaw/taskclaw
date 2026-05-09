-- F004: Create agent_approval_requests table for HITL approval gates
CREATE TABLE IF NOT EXISTS agent_approval_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestrated_task_id UUID NOT NULL REFERENCES orchestrated_tasks(id) ON DELETE CASCADE,
  requested_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  reason               TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  responded_at         TIMESTAMPTZ,
  response_note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_approval_requests_task_status
  ON agent_approval_requests(orchestrated_task_id, status);

ALTER TABLE agent_approval_requests ENABLE ROW LEVEL SECURITY;

-- RLS via join to orchestrated_tasks → account_id
DO $$ BEGIN
  CREATE POLICY "Users see approval requests in their accounts" ON agent_approval_requests
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM orchestrated_tasks ot
        WHERE ot.id = agent_approval_requests.orchestrated_task_id
          AND ot.account_id IN (SELECT get_auth_user_account_ids())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage approval requests" ON agent_approval_requests
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM orchestrated_tasks ot
        JOIN account_users au ON au.account_id = ot.account_id
        WHERE ot.id = agent_approval_requests.orchestrated_task_id
          AND au.user_id = auth.uid()
          AND au.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
