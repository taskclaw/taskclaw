-- Step-level rich configuration
-- These fields control HOW and WHEN a step executes,
-- while linked_category_id controls WHAT it does (skills, knowledge, prompt).

-- Trigger: what causes the step to execute
ALTER TABLE public.board_steps
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'on_entry';

-- Fix constraint to accept 'on_entry' instead of legacy 'auto'
ALTER TABLE public.board_steps DROP CONSTRAINT IF EXISTS board_steps_trigger_type_check;
ALTER TABLE public.board_steps ADD CONSTRAINT board_steps_trigger_type_check
  CHECK (trigger_type = ANY (ARRAY['on_entry', 'auto', 'manual', 'schedule', 'webhook']));
UPDATE public.board_steps SET trigger_type = 'on_entry' WHERE trigger_type = 'auto';

COMMENT ON COLUMN public.board_steps.trigger_type IS 'on_entry = auto when card arrives, manual = user triggers, schedule = cron, webhook = external';

-- AI First: auto-execute AI on card entry vs. wait for manual trigger
ALTER TABLE public.board_steps
  ADD COLUMN IF NOT EXISTS ai_first BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.board_steps.ai_first IS 'When true and linked to a category, AI processes the card automatically on entry';

-- Input schema: what data the card needs at this stage
ALTER TABLE public.board_steps
  ADD COLUMN IF NOT EXISTS input_schema JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.board_steps.input_schema IS 'Array of {key, label, type, required, default_value, options} defining mandatory/optional inputs';

-- Output schema: structured output the step produces
ALTER TABLE public.board_steps
  ADD COLUMN IF NOT EXISTS output_schema JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.board_steps.output_schema IS 'Array of {key, label, type, default_value, options} defining expected outputs';

-- Move-to on success: explicit next step (defaults to next position if null)
ALTER TABLE public.board_steps
  ADD COLUMN IF NOT EXISTS on_success_step_id UUID REFERENCES public.board_steps(id) ON DELETE SET NULL;

-- Move-to on error: where to route on failure (null = stay in place)
ALTER TABLE public.board_steps
  ADD COLUMN IF NOT EXISTS on_error_step_id UUID REFERENCES public.board_steps(id) ON DELETE SET NULL;

-- Webhook config (when trigger_type = 'webhook')
ALTER TABLE public.board_steps
  ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE public.board_steps
  ADD COLUMN IF NOT EXISTS webhook_auth_header TEXT;

-- Schedule config (when trigger_type = 'schedule')
ALTER TABLE public.board_steps
  ADD COLUMN IF NOT EXISTS schedule_cron TEXT;

CREATE INDEX IF NOT EXISTS idx_board_steps_success ON public.board_steps(on_success_step_id) WHERE on_success_step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_board_steps_error ON public.board_steps(on_error_step_id) WHERE on_error_step_id IS NOT NULL;
