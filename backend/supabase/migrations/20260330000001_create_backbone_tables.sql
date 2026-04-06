-- ============================================================
-- F001: Create backbone_definitions table
-- F002: Create backbone_connections table
-- ============================================================

CREATE TABLE backbone_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'bot',
  color TEXT NOT NULL DEFAULT '#6366f1',
  protocol TEXT NOT NULL CHECK (protocol IN ('websocket', 'http', 'mcp', 'cli')),
  supports_streaming BOOLEAN DEFAULT TRUE,
  supports_heartbeat BOOLEAN DEFAULT FALSE,
  supports_agent_mode BOOLEAN DEFAULT FALSE,
  supports_tool_use BOOLEAN DEFAULT FALSE,
  supports_file_access BOOLEAN DEFAULT FALSE,
  supports_code_execution BOOLEAN DEFAULT FALSE,
  config_schema JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE backbone_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  backbone_type TEXT NOT NULL,          -- adapter slug (e.g. 'openclaw', 'openrouter')
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',   -- per-field-encrypted key/value pairs
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'down', 'unknown')),
  health_checked_at TIMESTAMPTZ,
  health_error TEXT,
  verified_at TIMESTAMPTZ,
  total_requests BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_backbone_connections_account ON backbone_connections(account_id);
CREATE INDEX idx_backbone_connections_type ON backbone_connections(backbone_type);
CREATE INDEX idx_backbone_connections_default ON backbone_connections(account_id, is_default) WHERE is_default = TRUE;
