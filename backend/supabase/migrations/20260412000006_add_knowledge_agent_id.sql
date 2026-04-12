-- F05: Add agent_id FK to knowledge_docs table
ALTER TABLE knowledge_docs
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_agent_id ON knowledge_docs(agent_id)
  WHERE agent_id IS NOT NULL;

-- Migration: copy category_id -> agent_id via migrated_from_category_id
UPDATE knowledge_docs kd
SET agent_id = a.id
FROM agents a
WHERE a.migrated_from_category_id = kd.category_id
  AND kd.category_id IS NOT NULL
  AND kd.agent_id IS NULL;
