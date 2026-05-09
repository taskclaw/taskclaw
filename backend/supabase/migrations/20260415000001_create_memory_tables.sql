-- DB01: agent_memories table (pluggable memory layer)
-- DB02: memory_connections table (adapter registry)

-- Ensure pgvector is available
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- DB01: agent_memories
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  content text NOT NULL,
  content_embedding vector(1536),
  type text NOT NULL DEFAULT 'episodic' CHECK (type IN ('episodic', 'semantic', 'procedural', 'working')),
  source text NOT NULL DEFAULT 'agent' CHECK (source IN ('agent', 'human', 'sync')),
  salience float NOT NULL DEFAULT 1.0,
  valid_from timestamptz DEFAULT now(),
  valid_to timestamptz,
  -- Optional FK associations (all nullable)
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  board_instance_id uuid REFERENCES board_instances(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_agent_memories_embedding
  ON agent_memories USING hnsw (content_embedding vector_cosine_ops);

-- Standard lookup indexes
CREATE INDEX IF NOT EXISTS idx_agent_memories_account ON agent_memories(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_type ON agent_memories(account_id, type);
CREATE INDEX IF NOT EXISTS idx_agent_memories_task ON agent_memories(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memories_conversation ON agent_memories(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memories_salience ON agent_memories(account_id, salience DESC);

-- RLS
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see memories in their workspaces" ON agent_memories
    FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage memories" ON agent_memories
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM account_users
        WHERE account_users.account_id = agent_memories.account_id
          AND account_users.user_id = auth.uid()
          AND account_users.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Vector similarity search function for agent_memories
CREATE OR REPLACE FUNCTION search_memories_vector(
  query_embedding vector(1536),
  p_account_id uuid,
  match_limit int DEFAULT 10,
  similarity_threshold float DEFAULT 0.3,
  p_task_id uuid DEFAULT NULL,
  p_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  account_id uuid,
  content text,
  type text,
  source text,
  salience float,
  task_id uuid,
  conversation_id uuid,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.account_id,
    m.content,
    m.type,
    m.source,
    m.salience,
    m.task_id,
    m.conversation_id,
    m.metadata,
    m.created_at,
    1 - (m.content_embedding <=> query_embedding) AS similarity
  FROM agent_memories m
  WHERE m.account_id = p_account_id
    AND m.content_embedding IS NOT NULL
    AND m.valid_to IS NULL
    AND (p_task_id IS NULL OR m.task_id = p_task_id)
    AND (p_type IS NULL OR m.type = p_type)
    AND 1 - (m.content_embedding <=> query_embedding) > similarity_threshold
  ORDER BY m.content_embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_memories_vector(vector, uuid, int, float, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION search_memories_vector(vector, uuid, int, float, uuid, text) TO service_role;

-- ============================================================
-- DB02: memory_connections
-- ============================================================
CREATE TABLE IF NOT EXISTS memory_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  adapter_slug text NOT NULL DEFAULT 'default',
  name text NOT NULL DEFAULT 'Default Memory',
  config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  is_account_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Only one default connection per account
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_connections_account_default
  ON memory_connections(account_id)
  WHERE is_account_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_memory_connections_account ON memory_connections(account_id);

-- RLS
ALTER TABLE memory_connections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see memory connections in their workspaces" ON memory_connections
    FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage memory connections" ON memory_connections
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM account_users
        WHERE account_users.account_id = memory_connections.account_id
          AND account_users.user_id = auth.uid()
          AND account_users.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed: create a default memory_connections row for every existing account
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM accounts LOOP
    INSERT INTO memory_connections (account_id, adapter_slug, name, config, is_active, is_account_default)
    VALUES (rec.id, 'default', 'Default Memory', '{}', true, true)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;
