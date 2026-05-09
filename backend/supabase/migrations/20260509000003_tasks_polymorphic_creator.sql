-- ============================================================
-- F4 — tasks polymorphic creator (PRD §1 + §7.1)
-- Mention-spawned tasks need to record "agent X was assigned because
-- user Y mentioned them in [task Z's notes]". The polymorphic creator
-- columns earn their keep here; we keep the rollout tight to the surface
-- where it matters (PRD's "where it earns its keep" stance).
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS creator_type text NOT NULL DEFAULT 'user'
    CHECK (creator_type IN ('user', 'agent', 'system')),
  ADD COLUMN IF NOT EXISTS creator_id uuid;

-- Free-form context the dispatcher records when spawning a task in
-- response to a mention. Examples:
--   { trigger: 'mention', source_task_id, source_user_id, mention_depth }
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS input_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tasks_creator_user
  ON tasks(creator_id) WHERE creator_type = 'user';

CREATE INDEX IF NOT EXISTS idx_tasks_creator_agent
  ON tasks(creator_id) WHERE creator_type = 'agent';

CREATE INDEX IF NOT EXISTS idx_tasks_mention_chain
  ON tasks((input_context->>'source_task_id'))
  WHERE input_context->>'trigger' = 'mention';
