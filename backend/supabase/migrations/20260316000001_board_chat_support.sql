-- Board AI Chat: orchestrator agent + board-scoped conversations
-- ================================================================

-- 1. Board orchestrator agent (separate from default_category_id)
ALTER TABLE public.board_instances
  ADD COLUMN IF NOT EXISTS orchestrator_category_id UUID
    REFERENCES public.categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.board_instances.orchestrator_category_id IS
  'Agent used for board-level AI chat (orchestrator). Separate from default_category_id which is the fallback for task processing.';

-- 2. Board-scoped conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS board_id UUID
    REFERENCES public.board_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_board_id
  ON public.conversations(board_id) WHERE board_id IS NOT NULL;

COMMENT ON COLUMN public.conversations.board_id IS
  'Optional: Links conversation to a board instance for board-level AI chat';
