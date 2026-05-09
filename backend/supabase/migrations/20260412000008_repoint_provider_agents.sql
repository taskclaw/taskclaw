-- F07: Add agent_id FK to provider_agents, migrate from category_id
ALTER TABLE provider_agents
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_provider_agents_agent_id ON provider_agents(agent_id)
  WHERE agent_id IS NOT NULL;

-- Migration: map category_id -> agent_id via agents.migrated_from_category_id
UPDATE provider_agents pa
SET agent_id = a.id
FROM agents a
WHERE a.migrated_from_category_id = pa.category_id
  AND pa.category_id IS NOT NULL
  AND pa.agent_id IS NULL;
