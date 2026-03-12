-- ============================================================================
-- Agent Cascade: Board-level default + Card-level override
-- ============================================================================
-- Enables 3-tier agent priority: Card → Column → Board
-- When resolving which agent (category+skills) to use for a task:
--   1. task.override_category_id  (card-level, highest priority)
--   2. board_step.linked_category_id  (column-level, existing)
--   3. board_instance.default_category_id  (board-level fallback)
--   4. task.category_id  (legacy fallback)

-- 1. Board-level default agent (category with skills)
ALTER TABLE public.board_instances
  ADD COLUMN IF NOT EXISTS default_category_id UUID
    REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_board_instances_default_category
  ON public.board_instances(default_category_id)
  WHERE default_category_id IS NOT NULL;

-- 2. Card-level agent override
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS override_category_id UUID
    REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_override_category
  ON public.tasks(override_category_id)
  WHERE override_category_id IS NOT NULL;
