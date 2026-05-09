-- ============================================================
-- F1 — Syncs (PRD §4.3)
-- A Sync is a recurring, idempotent ingestion job that pulls
-- *content* (not just data) from a source (local folder, git
-- repo, marketplace, notion, gdrive) into TaskClaw and registers
-- or refreshes it in our catalog so users can use it inside Pods.
-- Direction is inbound-only. Output is catalog rows, not external
-- mutations. Schedule is first-class.
-- ============================================================

CREATE TABLE IF NOT EXISTS syncs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name            text NOT NULL,
  sync_type       text NOT NULL CHECK (sync_type IN ('skills', 'knowledge', 'pods')),
  source_kind     text NOT NULL CHECK (source_kind IN ('local-folder', 'git-repo', 'marketplace', 'notion', 'gdrive')),
  -- config holds source-specific fields. Encrypted at rest at the
  -- application layer for fields containing secrets (tokens, etc.).
  -- Examples: { paths: ["~/.claude/skills"] } | { repo_url: "https://...", path_glob: "skills/*" }
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_cron   text,                    -- e.g. '0 2 * * *'; NULL = manual-only
  last_run_at     timestamptz,
  last_status     text CHECK (last_status IN ('ok', 'error', 'partial', 'running')),
  last_error      text,
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_syncs_account
  ON syncs(account_id);

-- "due syncs" lookup: any enabled sync, ordered by oldest last_run_at first.
-- The actual due-or-not check is done in the runner against schedule_cron.
CREATE INDEX IF NOT EXISTS idx_syncs_due
  ON syncs(last_run_at NULLS FIRST)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_syncs_type
  ON syncs(account_id, sync_type);

-- One active row per (account, source_kind, source identity).
-- For local-folder syncs the identity comes from config->>'paths' (one row per
-- distinct path-set). For git-repo from config->>'repo_url'. We enforce a
-- soft uniqueness on the canonical_source_uri column maintained by triggers
-- only when needed. For v1 we keep it open and rely on UI dedup; tighten later.

ALTER TABLE syncs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see syncs in their accounts" ON syncs
    FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users insert syncs in their accounts" ON syncs
    FOR INSERT WITH CHECK (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users update syncs in their accounts" ON syncs
    FOR UPDATE USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users delete syncs in their accounts" ON syncs
    FOR DELETE USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- sync_runs — one row per execution attempt, useful for the UI
-- "Last run: 2h ago (12 added, 3 updated)" status line.
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id       uuid NOT NULL REFERENCES syncs(id) ON DELETE CASCADE,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL CHECK (status IN ('running', 'ok', 'error', 'partial', 'cancelled')),
  items_added   int NOT NULL DEFAULT 0,
  items_updated int NOT NULL DEFAULT 0,
  items_removed int NOT NULL DEFAULT 0,
  log_excerpt   text,
  trigger       text NOT NULL CHECK (trigger IN ('schedule', 'manual', 'hook'))
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_sync
  ON sync_runs(sync_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_runs_status_recent
  ON sync_runs(status, started_at DESC);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see sync_runs in their accounts" ON sync_runs
    FOR SELECT USING (
      sync_id IN (
        SELECT id FROM syncs WHERE account_id IN (SELECT get_auth_user_account_ids())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at maintenance for syncs
CREATE OR REPLACE FUNCTION set_syncs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_syncs_set_updated_at ON syncs;
CREATE TRIGGER trg_syncs_set_updated_at
  BEFORE UPDATE ON syncs
  FOR EACH ROW
  EXECUTE FUNCTION set_syncs_updated_at();
