-- Enhance board_routes for full inter-board / inter-pod routing
-- Adds: error + fallback trigger types, label column, conditions jsonb
-- The pod_id column already exists (added in 20260411000003)

-- 1. Extend the trigger CHECK constraint to include error and fallback
ALTER TABLE board_routes DROP CONSTRAINT IF EXISTS board_routes_trigger_check;
ALTER TABLE board_routes
  ADD CONSTRAINT board_routes_trigger_check
  CHECK (trigger IN ('auto', 'manual', 'ai_decision', 'error', 'fallback'));

-- 2. Add label column (UI already sends it, backend was discarding it)
ALTER TABLE board_routes
  ADD COLUMN IF NOT EXISTS label text;

-- 3. Add conditions jsonb for future conditional routing logic
ALTER TABLE board_routes
  ADD COLUMN IF NOT EXISTS conditions jsonb DEFAULT '{}';

-- 4. Ensure pod_id column exists (may already exist from v2 migrations)
ALTER TABLE board_routes
  ADD COLUMN IF NOT EXISTS pod_id uuid REFERENCES pods(id) ON DELETE SET NULL;

-- 5. Index for fast manual/error route lookups by board
CREATE INDEX IF NOT EXISTS idx_board_routes_source_trigger
  ON board_routes (source_board_id, trigger, is_active);
