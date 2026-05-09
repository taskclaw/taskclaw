-- ============================================================
-- §12.2 — tsvector full-text indexes (PRD §12.2)
-- We already have pgvector for semantic search. tsvector is the
-- "instant exact match" layer that runs FIRST in the search stack.
-- Repeats the pattern across tasks, messages, skills, pods so the
-- factory dashboard's search-across-everything stays under 30ms cold.
-- ============================================================

-- ── tasks ─────────────────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS search_index tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(notes, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_tasks_search
  ON tasks USING gin(search_index);

-- ── messages ──────────────────────────────────────────────────
-- The kind='log' / 'thinking' rows are noisy; we still index them so
-- callers can opt in. Filter at the query layer when noise hurts.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS search_index tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(content, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_messages_search
  ON messages USING gin(search_index);

-- ── skills ────────────────────────────────────────────────────
-- Skill instructions can be 50KB; we index name + description only,
-- which is what the slash palette and skill picker actually search.
ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS search_index tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' || coalesce(description, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_skills_search
  ON skills USING gin(search_index);

-- ── pods ──────────────────────────────────────────────────────
ALTER TABLE pods
  ADD COLUMN IF NOT EXISTS search_index tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' || coalesce(description, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_pods_search
  ON pods USING gin(search_index);
