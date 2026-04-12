-- F06: Add agent_id FK to conversations table (agent-scoped conversations)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_agent_id ON conversations(agent_id)
  WHERE agent_id IS NOT NULL;
