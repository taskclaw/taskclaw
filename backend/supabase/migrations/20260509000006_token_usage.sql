-- ============================================================
-- F8 — OSS-edition token usage + factory dashboard (PRD §11)
-- Today only the cloud edition (Langfuse) tracks per-call usage.
-- This migration brings the same observability into self-hosted
-- and powers the Factory Dashboard ("what's expensive? throughput?
-- failure modes? cache hit rate?").
-- ============================================================

CREATE TABLE IF NOT EXISTS token_usage (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Optional links: a single backbone call may be a chat turn (message_id)
  -- or a task run (task_id). Either, neither, or both can be set.
  message_id          uuid REFERENCES messages(id) ON DELETE SET NULL,
  task_id             uuid REFERENCES tasks(id) ON DELETE SET NULL,
  agent_id            uuid REFERENCES agents(id) ON DELETE SET NULL,
  pod_id              uuid REFERENCES pods(id) ON DELETE SET NULL,
  conversation_id     uuid REFERENCES conversations(id) ON DELETE SET NULL,
  provider            text NOT NULL,                  -- 'anthropic','openai',...
  model               text NOT NULL,
  input_tokens        int NOT NULL DEFAULT 0,
  output_tokens       int NOT NULL DEFAULT 0,
  cache_read_tokens   int NOT NULL DEFAULT 0,
  cache_write_tokens  int NOT NULL DEFAULT 0,
  estimated_cost_usd  numeric(12, 6),                 -- computed at insert
  latency_ms          int,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- fix: date_trunc('day', timestamptz) is STABLE (depends on session TZ), not
-- IMMUTABLE, so it can't be used in an index expression on a fresh DB. Index the
-- raw created_at column instead; range scans on account_id+created_at serve the
-- same per-day dashboard queries.
CREATE INDEX IF NOT EXISTS idx_token_usage_account_day
  ON token_usage(account_id, created_at);

CREATE INDEX IF NOT EXISTS idx_token_usage_agent
  ON token_usage(agent_id, created_at DESC)
  WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_token_usage_pod
  ON token_usage(pod_id, created_at DESC)
  WHERE pod_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_token_usage_provider_model
  ON token_usage(account_id, provider, model);

ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see token_usage in their accounts" ON token_usage
    FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- token_usage_daily — rollup table populated by a cron.
-- Avoids hammering the raw table for dashboard queries.
-- ============================================================

CREATE TABLE IF NOT EXISTS token_usage_daily (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  day                 date NOT NULL,
  pod_id              uuid REFERENCES pods(id) ON DELETE SET NULL,
  agent_id            uuid REFERENCES agents(id) ON DELETE SET NULL,
  provider            text NOT NULL,
  model               text NOT NULL,
  total_input_tokens  bigint NOT NULL DEFAULT 0,
  total_output_tokens bigint NOT NULL DEFAULT 0,
  total_cache_read_tokens  bigint NOT NULL DEFAULT 0,
  total_cache_write_tokens bigint NOT NULL DEFAULT 0,
  total_cost_usd      numeric(14, 6) NOT NULL DEFAULT 0,
  call_count          int NOT NULL DEFAULT 0,
  rolled_up_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS token_usage_daily_unique
  ON token_usage_daily(account_id, day, COALESCE(pod_id, '00000000-0000-0000-0000-000000000000'::uuid),
                       COALESCE(agent_id, '00000000-0000-0000-0000-000000000000'::uuid),
                       provider, model);

CREATE INDEX IF NOT EXISTS idx_token_usage_daily_account_day
  ON token_usage_daily(account_id, day DESC);

ALTER TABLE token_usage_daily ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see token_usage_daily in their accounts" ON token_usage_daily
    FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
