-- F003: Create semaphore_leases table for per-account backbone concurrency control
CREATE TABLE IF NOT EXISTS semaphore_leases (
  account_id   UUID NOT NULL,
  resource_key TEXT NOT NULL,
  holder_id    UUID NOT NULL,
  acquired_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, resource_key, holder_id)
);

-- Regular index on expires_at for lease expiry queries (partial index with NOW() not allowed)
CREATE INDEX IF NOT EXISTS idx_semaphore_expires_at
  ON semaphore_leases(expires_at);

CREATE INDEX IF NOT EXISTS idx_semaphore_account_resource
  ON semaphore_leases(account_id, resource_key);

-- Service role only — no user-facing RLS needed for this table
-- RLS is intentionally not enabled; access is restricted to service role via Supabase anon key policies
