-- ============================================================
-- F7 — task_runs state machine (PRD §10.1)
-- Today task execution state is split across BullMQ jobs, the `tasks`
-- table, and `orchestrated_tasks`. We introduce `task_runs` as a
-- single Postgres-backed audit log for "did this run succeed, when,
-- why did it fail?".
--
-- v1 ships this table as ADDITIVE — BullMQ remains the trigger and
-- source-of-truth for retries; task_runs is dual-written behind the
-- FEATURE_TASK_RUNS_V2 flag so we can validate row shape and query
-- patterns before migrating callers to read from it.
-- ============================================================

CREATE TABLE IF NOT EXISTS task_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  task_id               uuid REFERENCES tasks(id) ON DELETE CASCADE,
  orchestrated_task_id  uuid REFERENCES orchestrated_tasks(id) ON DELETE CASCADE,
  pod_id                uuid REFERENCES pods(id) ON DELETE SET NULL,
  agent_id              uuid REFERENCES agents(id) ON DELETE SET NULL,
  status                text NOT NULL CHECK (status IN
                          ('queued', 'dispatched', 'running', 'completed', 'failed', 'cancelled')),
  attempt               int NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  max_attempts          int NOT NULL DEFAULT 2 CHECK (max_attempts >= 1),
  parent_run_id         uuid REFERENCES task_runs(id) ON DELETE SET NULL,
  trigger               text NOT NULL CHECK (trigger IN
                          ('manual', 'autopilot', 'mention', 'heartbeat', 'dag', 'schedule')),
  failure_reason        text CHECK (failure_reason IS NULL OR failure_reason IN
                          ('agent_error', 'timeout', 'runtime_offline', 'manual',
                           'circuit_open', 'invalid_input', 'tool_error', 'other')),
  failure_message       text,
  result                jsonb,
  -- Free-form metadata: bullmq job id, correlation id, source mention id, etc.
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at            timestamptz,
  finished_at           timestamptz,
  duration_ms           int,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_runs_account_recent
  ON task_runs(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_runs_task
  ON task_runs(task_id, created_at DESC)
  WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_runs_orch
  ON task_runs(orchestrated_task_id, created_at DESC)
  WHERE orchestrated_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_runs_pod_status
  ON task_runs(pod_id, status, created_at DESC)
  WHERE pod_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_runs_agent
  ON task_runs(agent_id, created_at DESC)
  WHERE agent_id IS NOT NULL;

-- "Active runs" lookup — what's queued or running right now.
CREATE INDEX IF NOT EXISTS idx_task_runs_active
  ON task_runs(account_id, status, created_at DESC)
  WHERE status IN ('queued', 'dispatched', 'running');

ALTER TABLE task_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see task_runs in their accounts" ON task_runs
    FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- §10.2 — additive autopilot fields on heartbeat_configs.
-- The full rename to `autopilots` is deferred (destructive ops are
-- gated by user authorization). Today's heartbeat already IS the
-- autopilot in everything but name; these columns add the missing
-- knobs Multica's design surfaced.
-- ============================================================

ALTER TABLE heartbeat_configs
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'create_task'
    CHECK (execution_mode IN ('create_task', 'run_only')),
  ADD COLUMN IF NOT EXISTS concurrency_policy text NOT NULL DEFAULT 'queue'
    CHECK (concurrency_policy IN ('skip', 'queue', 'replace'));

-- ============================================================
-- autopilot_triggers — child table that decouples "this autopilot
-- exists" from "these things fire it". Triggers can be schedule
-- (cron), webhook (token-authenticated), manual (button only), or
-- mention (driven by F4). v1 keeps them attached to the
-- heartbeat_configs row — they'll repoint at the renamed
-- `autopilots` table when we cutover.
-- ============================================================

CREATE TABLE IF NOT EXISTS autopilot_triggers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autopilot_id       uuid NOT NULL REFERENCES heartbeat_configs(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('schedule', 'webhook', 'manual', 'mention')),
  cron_expression    text,
  webhook_token      text,
  next_run_at        timestamptz,
  last_fired_at      timestamptz,
  enabled            boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_triggers_autopilot
  ON autopilot_triggers(autopilot_id);

CREATE INDEX IF NOT EXISTS idx_autopilot_triggers_due
  ON autopilot_triggers(next_run_at NULLS FIRST)
  WHERE enabled = true AND kind = 'schedule';

CREATE UNIQUE INDEX IF NOT EXISTS autopilot_triggers_webhook_token
  ON autopilot_triggers(webhook_token)
  WHERE webhook_token IS NOT NULL;

ALTER TABLE autopilot_triggers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see autopilot_triggers in their accounts" ON autopilot_triggers
    FOR SELECT USING (
      autopilot_id IN (
        SELECT id FROM heartbeat_configs
        WHERE account_id IN (SELECT get_auth_user_account_ids())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
