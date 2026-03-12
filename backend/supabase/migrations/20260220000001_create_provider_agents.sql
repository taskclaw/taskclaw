-- Provider Agents: Track synced skills/knowledge on AI provider (OpenClaw)
-- Each (account, category) pair maps to a SKILL.md file on the provider

-- =====================================================
-- 1. Provider Agents Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.provider_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,

  -- Provider identity
  provider_type TEXT NOT NULL DEFAULT 'openclaw',
  remote_skill_path TEXT,             -- e.g. 'taskclaw-work' (the category slug used on the server)

  -- Content tracking for change detection
  instructions_hash TEXT,             -- SHA-256 of compiled SKILL.md content
  compiled_instructions TEXT,         -- Full compiled text (cached for preview/debug)
  skill_ids_snapshot JSONB DEFAULT '[]'::jsonb,  -- Skill IDs included at last sync
  knowledge_doc_id UUID,              -- Master knowledge doc ID included at last sync

  -- Sync status
  sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error', 'stale')),
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One agent per (account, category)
  CONSTRAINT provider_agents_unique_account_category UNIQUE(account_id, category_id)
);

-- =====================================================
-- 2. Indexes
-- =====================================================
CREATE INDEX idx_provider_agents_account
  ON public.provider_agents(account_id);

CREATE INDEX idx_provider_agents_category
  ON public.provider_agents(account_id, category_id);

-- Find stale/pending/error rows for cron processing
CREATE INDEX idx_provider_agents_sync_status
  ON public.provider_agents(sync_status)
  WHERE sync_status IN ('pending', 'stale', 'error');

-- Find error rows due for retry
CREATE INDEX idx_provider_agents_retry
  ON public.provider_agents(next_retry_at)
  WHERE sync_status = 'error' AND next_retry_at IS NOT NULL;

-- =====================================================
-- 3. Auto-update trigger for updated_at
-- =====================================================
CREATE TRIGGER update_provider_agents_updated_at
  BEFORE UPDATE ON public.provider_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. Row-Level Security (RLS)
-- =====================================================
ALTER TABLE public.provider_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view provider agents in their accounts"
  ON public.provider_agents
  FOR SELECT
  USING (
    account_id IN (SELECT get_auth_user_account_ids())
  );

CREATE POLICY "Users can manage provider agents in their accounts"
  ON public.provider_agents
  FOR ALL
  USING (
    account_id IN (SELECT get_auth_user_account_ids())
  );

-- =====================================================
-- 5. Agent Sync Logs Table (audit trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.agent_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_agent_id UUID NOT NULL REFERENCES public.provider_agents(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'verify')),
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  instructions_hash TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. Sync Logs Indexes
-- =====================================================
CREATE INDEX idx_agent_sync_logs_agent
  ON public.agent_sync_logs(provider_agent_id);

CREATE INDEX idx_agent_sync_logs_created
  ON public.agent_sync_logs(created_at DESC);

CREATE INDEX idx_agent_sync_logs_account
  ON public.agent_sync_logs(account_id);

-- =====================================================
-- 7. Sync Logs RLS
-- =====================================================
ALTER TABLE public.agent_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view agent sync logs in their accounts"
  ON public.agent_sync_logs
  FOR SELECT
  USING (
    account_id IN (SELECT get_auth_user_account_ids())
  );

-- =====================================================
-- 8. Comments
-- =====================================================
COMMENT ON TABLE public.provider_agents IS
  'Tracks synced skills/knowledge on AI providers (OpenClaw). Each (account, category) maps to a SKILL.md file.';

COMMENT ON TABLE public.agent_sync_logs IS
  'Audit trail for provider agent sync operations (create, update, delete, verify).';

COMMENT ON COLUMN public.provider_agents.instructions_hash IS
  'SHA-256 hash of the compiled SKILL.md content for change detection.';

COMMENT ON COLUMN public.provider_agents.sync_status IS
  'pending=new, syncing=in-progress, synced=up-to-date, error=failed, stale=needs-resync.';
