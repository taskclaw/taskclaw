-- Link board steps to categories
-- When a step has a linked category, it inherits the category's AI config
-- (skills, knowledge bases, system prompt via provider_agents)

ALTER TABLE public.board_steps
  ADD COLUMN IF NOT EXISTS linked_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_board_steps_category ON public.board_steps(linked_category_id) WHERE linked_category_id IS NOT NULL;

COMMENT ON COLUMN public.board_steps.linked_category_id IS 'When set, this step inherits the AI config (skills, knowledge, system prompt) from the linked category. Tasks entering this step are automatically processed using the category''s instructions.';
