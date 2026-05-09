-- ============================================================
-- F6 — per-agent custom_env / custom_args (PRD §9)
-- Lets a single agent override account-level backbone config — e.g.
-- one agent on Bedrock for compliance while the rest use Anthropic.
-- Values are encrypted at the application layer (encryption.util.ts)
-- and masked in API responses; the column itself stores the encrypted
-- payload as JSONB so we keep typed access.
-- ============================================================

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS custom_env jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_args jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Cheap sanity guards: custom_args should be an array, custom_env an object.
-- We rely on app-level validation (Zod) for stricter shapes.
ALTER TABLE agents
  DROP CONSTRAINT IF EXISTS agents_custom_env_object;
ALTER TABLE agents
  ADD CONSTRAINT agents_custom_env_object
    CHECK (jsonb_typeof(custom_env) = 'object');

ALTER TABLE agents
  DROP CONSTRAINT IF EXISTS agents_custom_args_array;
ALTER TABLE agents
  ADD CONSTRAINT agents_custom_args_array
    CHECK (jsonb_typeof(custom_args) = 'array');
