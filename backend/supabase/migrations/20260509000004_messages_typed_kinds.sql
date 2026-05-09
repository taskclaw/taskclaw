-- ============================================================
-- F5 — typed message kinds + author polymorphism (PRD §8 + §1)
-- Today every AI response is a single `content` blob with role='assistant'.
-- We split it into kinds so the UI can collapse thinking, render
-- tool_use/tool_result as cards, and dev-mode-only filter logs.
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text'
    CHECK (kind IN ('text', 'thinking', 'tool_use', 'tool_result', 'status', 'error', 'log')),
  ADD COLUMN IF NOT EXISTS author_type text
    CHECK (author_type IN ('user', 'agent', 'system')),
  ADD COLUMN IF NOT EXISTS author_id uuid;

-- Backfill author_type from existing role to keep historical messages
-- queryable through the new lens. role='assistant' becomes author_type='agent';
-- author_id stays NULL — the assistant agent identity is recoverable via
-- conversations.agent_id when callers care.
UPDATE messages
SET author_type = CASE
  WHEN role = 'user' THEN 'user'
  WHEN role = 'assistant' THEN 'agent'
  ELSE 'system'
END
WHERE author_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_kind
  ON messages(conversation_id, kind);

CREATE INDEX IF NOT EXISTS idx_messages_author
  ON messages(author_type, author_id)
  WHERE author_id IS NOT NULL;
