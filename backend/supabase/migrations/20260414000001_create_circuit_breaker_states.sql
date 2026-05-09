-- Circuit breaker state (replaces in-memory Map)
-- Tracks failure counts and open/closed state per backbone config
-- State survives restarts and deploys

CREATE TABLE IF NOT EXISTS circuit_breaker_states (
  config_id       UUID PRIMARY KEY,
  failure_count   INT  NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  state           TEXT NOT NULL DEFAULT 'closed'  -- 'closed' | 'open' | 'half-open'
);
