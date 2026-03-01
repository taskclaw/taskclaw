-- Communication Tool Integrations
-- Tracks which communication tools (Telegram, WhatsApp, Slack) the user has declared
-- as available in their OpenClaw instance, plus health monitoring state.
-- When enabled, a seed SKILL is synced to OpenClaw; health is checked via verifySkill.

-- =====================================================
-- 1. Communication Tool Integrations Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.comm_tool_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Which tool
  tool_type TEXT NOT NULL
    CHECK (tool_type IN ('telegram', 'whatsapp', 'slack')),

  -- User toggle
  is_enabled BOOLEAN NOT NULL DEFAULT false,

  -- Health monitoring
  health_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('healthy', 'unhealthy', 'checking', 'unknown')),
  last_checked_at TIMESTAMPTZ,
  last_healthy_at TIMESTAMPTZ,
  last_error TEXT,

  -- Configurable check interval (minutes). Default 5 min.
  check_interval_minutes INTEGER NOT NULL DEFAULT 5
    CHECK (check_interval_minutes >= 1 AND check_interval_minutes <= 1440),

  -- Optional tool-specific config (e.g. channel ID, bot username, etc.)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One row per (account, tool_type)
  CONSTRAINT comm_tool_integrations_unique_account_tool UNIQUE(account_id, tool_type)
);

-- =====================================================
-- 2. Indexes
-- =====================================================
CREATE INDEX idx_comm_tool_integrations_account
  ON public.comm_tool_integrations(account_id);

-- Find enabled tools due for health check
CREATE INDEX idx_comm_tool_integrations_health_check
  ON public.comm_tool_integrations(last_checked_at)
  WHERE is_enabled = true;

-- =====================================================
-- 3. Auto-update trigger for updated_at
-- =====================================================
CREATE TRIGGER update_comm_tool_integrations_updated_at
  BEFORE UPDATE ON public.comm_tool_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. Row-Level Security (RLS)
-- =====================================================
ALTER TABLE public.comm_tool_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comm tools in their accounts"
  ON public.comm_tool_integrations
  FOR SELECT
  USING (
    account_id IN (SELECT get_auth_user_account_ids())
  );

CREATE POLICY "Users can manage comm tools in their accounts"
  ON public.comm_tool_integrations
  FOR ALL
  USING (
    account_id IN (SELECT get_auth_user_account_ids())
  );

-- =====================================================
-- 5. Table-level permissions
-- =====================================================
GRANT ALL ON public.comm_tool_integrations TO authenticated, service_role;

-- =====================================================
-- 6. Comments
-- =====================================================
COMMENT ON TABLE public.comm_tool_integrations IS
  'Tracks communication tool availability in OpenClaw (Telegram, WhatsApp, Slack) per account.';

COMMENT ON COLUMN public.comm_tool_integrations.health_status IS
  'unknown=never checked, checking=in-progress, healthy=last check passed, unhealthy=last check failed.';

COMMENT ON COLUMN public.comm_tool_integrations.check_interval_minutes IS
  'How often (in minutes) the system pings OpenClaw to verify this tool is still available. User-configurable.';
