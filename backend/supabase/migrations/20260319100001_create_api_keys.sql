-- API Keys: Persistent authentication for agents and integrations
-- Stores hashed keys with tc_live_ prefix, scoped to accounts

CREATE TABLE IF NOT EXISTS public.api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  key_hash    TEXT NOT NULL,
  key_prefix  VARCHAR(12) NOT NULL,
  name        VARCHAR(100) NOT NULL,
  scopes      JSONB NOT NULL DEFAULT '[]',
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_account
  ON public.api_keys(account_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_user
  ON public.api_keys(user_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
  ON public.api_keys(key_prefix);

COMMENT ON TABLE public.api_keys IS
  'API keys for programmatic access (MCP, integrations, scripts)';

COMMENT ON COLUMN public.api_keys.key_hash IS
  'SHA-256 hash of the full API key. The raw key is only returned once on creation.';

COMMENT ON COLUMN public.api_keys.key_prefix IS
  'First 12 characters of the key (e.g. tc_live_a1b2) for identification without exposing the full key';

-- Row Level Security
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view API keys in their accounts"
  ON public.api_keys
  FOR SELECT
  USING (account_id IN (SELECT get_auth_user_account_ids()));

CREATE POLICY "Users can create API keys in their accounts"
  ON public.api_keys
  FOR INSERT
  WITH CHECK (account_id IN (SELECT get_auth_user_account_ids()));

CREATE POLICY "Users can delete API keys in their accounts"
  ON public.api_keys
  FOR DELETE
  USING (account_id IN (SELECT get_auth_user_account_ids()));

-- Grant permissions
GRANT ALL ON public.api_keys TO service_role;
GRANT SELECT, INSERT, DELETE ON public.api_keys TO authenticated;
