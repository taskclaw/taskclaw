-- Integration Architecture: Schema-Driven Marketplace
-- Creates integration_definitions, integration_connections, board_integration_refs tables
-- with RLS policies, indexes, triggers, and grants

-- ============================================================
-- 1. INTEGRATION DEFINITIONS (reusable templates / catalog entries)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.integration_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  slug            VARCHAR(100) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  icon            VARCHAR(50),
  categories      TEXT[] DEFAULT '{}',

  -- Auth configuration
  auth_type       VARCHAR(20) NOT NULL
    CHECK (auth_type IN ('api_key', 'oauth2', 'webhook', 'basic', 'none')),
  auth_config     JSONB DEFAULT '{}',
  config_fields   JSONB DEFAULT '[]',

  -- Linked Skill (teaches OpenClaw how to use this integration)
  skill_id        UUID REFERENCES public.skills(id) ON DELETE SET NULL,

  setup_guide     TEXT,
  is_system       BOOLEAN DEFAULT false,
  proxy_base_url  VARCHAR(500),

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT integration_definitions_unique_slug UNIQUE(account_id, slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_definitions_account
  ON public.integration_definitions(account_id);

CREATE INDEX IF NOT EXISTS idx_integration_definitions_auth_type
  ON public.integration_definitions(auth_type);

CREATE INDEX IF NOT EXISTS idx_integration_definitions_system
  ON public.integration_definitions(is_system) WHERE is_system = TRUE;

-- Updated at trigger
CREATE TRIGGER update_integration_definitions_updated_at
  BEFORE UPDATE ON public.integration_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.integration_definitions IS
  'Integration catalog entries - reusable definitions for third-party services';

COMMENT ON COLUMN public.integration_definitions.auth_config IS
  'Auth-specific config: OAuth URLs/scopes for oauth2, key field definitions for api_key';

COMMENT ON COLUMN public.integration_definitions.config_fields IS
  'Non-auth config fields (workspace ID, channel, etc.) as JSON array of field descriptors';

COMMENT ON COLUMN public.integration_definitions.skill_id IS
  'Linked skill that teaches OpenClaw how to use this integration API';

-- ============================================================
-- 2. INTEGRATION CONNECTIONS (per-account instances with credentials)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.integration_connections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  definition_id         UUID NOT NULL REFERENCES public.integration_definitions(id) ON DELETE CASCADE,

  -- Encrypted credentials (entire JSON blob encrypted as one AES-256-GCM value)
  credentials           TEXT,

  -- OAuth-specific
  token_expires_at      TIMESTAMPTZ,
  scopes                TEXT[],

  -- Status
  status                VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'expired', 'error', 'revoked')),
  verified_at           TIMESTAMPTZ,
  last_used_at          TIMESTAMPTZ,
  error_message         TEXT,

  -- Non-sensitive user config (selected workspace, channel, etc.)
  config                JSONB DEFAULT '{}',

  -- External account info
  external_account_name VARCHAR(255),

  -- Test chat conversation ID (for inline setup chat)
  test_conversation_id  UUID REFERENCES public.conversations(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT integration_connections_unique_per_account UNIQUE(account_id, definition_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_connections_account
  ON public.integration_connections(account_id);

CREATE INDEX IF NOT EXISTS idx_integration_connections_definition
  ON public.integration_connections(definition_id);

CREATE INDEX IF NOT EXISTS idx_integration_connections_status
  ON public.integration_connections(status);

CREATE INDEX IF NOT EXISTS idx_integration_connections_token_expiry
  ON public.integration_connections(token_expires_at)
  WHERE token_expires_at IS NOT NULL;

-- Updated at trigger
CREATE TRIGGER update_integration_connections_updated_at
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.integration_connections IS
  'Per-account integration instances with encrypted credentials';

COMMENT ON COLUMN public.integration_connections.credentials IS
  'Entire credentials JSON blob encrypted as a single AES-256-GCM value';

-- ============================================================
-- 3. BOARD INTEGRATION REFS (board <-> connection links)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.board_integration_refs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        UUID NOT NULL REFERENCES public.board_instances(id) ON DELETE CASCADE,
  connection_id   UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  is_required     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT board_integration_refs_unique UNIQUE(board_id, connection_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_board_integration_refs_board
  ON public.board_integration_refs(board_id);

CREATE INDEX IF NOT EXISTS idx_board_integration_refs_connection
  ON public.board_integration_refs(connection_id);

COMMENT ON TABLE public.board_integration_refs IS
  'Links boards to integration connections, replacing settings_override.integrations';

-- ============================================================
-- 4. ROW-LEVEL SECURITY
-- ============================================================

-- Integration Definitions: system defs readable by all, user defs scoped to account
ALTER TABLE public.integration_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view system integration definitions"
  ON public.integration_definitions
  FOR SELECT
  USING (
    is_system = TRUE
    OR account_id IN (SELECT get_auth_user_account_ids())
  );

CREATE POLICY "Users can create integration definitions in their accounts"
  ON public.integration_definitions
  FOR INSERT
  WITH CHECK (
    account_id IN (SELECT get_auth_user_account_ids())
  );

CREATE POLICY "Users can update integration definitions in their accounts"
  ON public.integration_definitions
  FOR UPDATE
  USING (
    account_id IN (SELECT get_auth_user_account_ids())
    AND is_system = FALSE
  );

CREATE POLICY "Users can delete integration definitions in their accounts"
  ON public.integration_definitions
  FOR DELETE
  USING (
    account_id IN (SELECT get_auth_user_account_ids())
    AND is_system = FALSE
  );

-- Integration Connections: scoped to account
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view connections in their accounts"
  ON public.integration_connections
  FOR SELECT
  USING (account_id IN (SELECT get_auth_user_account_ids()));

CREATE POLICY "Users can create connections in their accounts"
  ON public.integration_connections
  FOR INSERT
  WITH CHECK (account_id IN (SELECT get_auth_user_account_ids()));

CREATE POLICY "Users can update connections in their accounts"
  ON public.integration_connections
  FOR UPDATE
  USING (account_id IN (SELECT get_auth_user_account_ids()));

CREATE POLICY "Users can delete connections in their accounts"
  ON public.integration_connections
  FOR DELETE
  USING (account_id IN (SELECT get_auth_user_account_ids()));

-- Board Integration Refs: inherit access from board instance
ALTER TABLE public.board_integration_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view integration refs of their boards"
  ON public.board_integration_refs
  FOR SELECT
  USING (
    board_id IN (
      SELECT id FROM public.board_instances
      WHERE account_id IN (SELECT get_auth_user_account_ids())
    )
  );

CREATE POLICY "Users can manage integration refs of their boards"
  ON public.board_integration_refs
  FOR ALL
  USING (
    board_id IN (
      SELECT id FROM public.board_instances
      WHERE account_id IN (SELECT get_auth_user_account_ids())
    )
  );

-- ============================================================
-- 5. GRANT PERMISSIONS (service_role + authenticated)
-- ============================================================
GRANT ALL ON public.integration_definitions TO service_role;
GRANT ALL ON public.integration_connections TO service_role;
GRANT ALL ON public.board_integration_refs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_integration_refs TO authenticated;
