-- Multi-Board System: Create board_templates, board_instances, board_steps tables
-- Extend tasks table with board context columns
-- Create card_executions table (future-proofing)

-- ============================================================
-- 1. BOARD TEMPLATES (marketplace/system reusable definitions)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.board_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE, -- NULL = system/marketplace template

  -- Identity
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'layout-grid',
  color TEXT DEFAULT '#6366f1',
  tags TEXT[] DEFAULT '{}',

  -- The manifest JSON (source of truth for structure)
  manifest JSONB NOT NULL,
  manifest_version TEXT NOT NULL DEFAULT '1.0',

  -- Versioning
  version TEXT NOT NULL DEFAULT '1.0.0',
  changelog TEXT,

  -- Publishing
  is_published BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  author_name TEXT,
  author_email TEXT,

  -- Stats
  install_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id, slug)
);

-- ============================================================
-- 2. BOARD INSTANCES (user's active boards)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.board_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.board_templates(id) ON DELETE SET NULL,

  -- Identity (user can rename)
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'layout-grid',
  color TEXT DEFAULT '#6366f1',
  tags TEXT[] DEFAULT '{}',

  -- User customization
  is_favorite BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,

  -- Instance-level settings (merged over template defaults)
  settings_override JSONB DEFAULT '{}',

  -- Snapshot of manifest at install time (for diff/upgrade detection)
  installed_manifest JSONB,
  installed_version TEXT,
  latest_available_version TEXT,

  -- Status
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_instances_account ON public.board_instances(account_id) WHERE NOT is_archived;
CREATE INDEX IF NOT EXISTS idx_board_instances_favorite ON public.board_instances(account_id, is_favorite) WHERE NOT is_archived;

-- ============================================================
-- 3. BOARD STEPS (pipeline columns, per board instance)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.board_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_instance_id UUID NOT NULL REFERENCES public.board_instances(id) ON DELETE CASCADE,

  -- From manifest
  step_key TEXT NOT NULL,
  name TEXT NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN ('input', 'ai_process', 'human_review', 'action', 'done')),
  position INTEGER NOT NULL,
  color TEXT,

  -- AI Configuration
  ai_enabled BOOLEAN DEFAULT FALSE,
  ai_first BOOLEAN DEFAULT FALSE,
  system_prompt TEXT,
  model_override TEXT,
  temperature FLOAT,
  max_retries INTEGER DEFAULT 2,
  timeout_seconds INTEGER DEFAULT 120,

  -- Linked resources
  skill_ids UUID[] DEFAULT '{}',
  knowledge_base_ids UUID[] DEFAULT '{}',
  required_tool_ids TEXT[] DEFAULT '{}',

  -- Field schemas
  input_fields JSONB DEFAULT '[]',
  output_fields JSONB DEFAULT '[]',

  -- Triggers
  trigger_type TEXT DEFAULT 'manual' CHECK (trigger_type IN ('auto', 'manual', 'schedule', 'webhook')),
  trigger_config JSONB DEFAULT '{}',

  -- Routing
  on_complete_step_key TEXT,
  on_error_step_key TEXT,
  routing_rules JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(board_instance_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_board_steps_board ON public.board_steps(board_instance_id);

-- ============================================================
-- 4. EXTEND TASKS TABLE (add board context)
-- ============================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS board_instance_id UUID REFERENCES public.board_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_step_id UUID REFERENCES public.board_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_data JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS step_history JSONB DEFAULT '[]';

-- Remove hardcoded status constraint (board steps have arbitrary names)
-- Legacy tasks (board_instance_id IS NULL) continue using existing status values
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- Indexes for board task queries
CREATE INDEX IF NOT EXISTS idx_tasks_board ON public.tasks(board_instance_id) WHERE board_instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_step ON public.tasks(current_step_id) WHERE current_step_id IS NOT NULL;

-- ============================================================
-- 5. CARD EXECUTIONS (AI job log — future phase)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.card_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  board_step_id UUID NOT NULL REFERENCES public.board_steps(id) ON DELETE CASCADE,

  -- Execution details
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- AI interaction
  system_prompt_used TEXT,
  ai_request JSONB,
  ai_response JSONB,
  tokens_used JSONB,

  -- Output
  output_data JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Routing decision
  routed_to_step_key TEXT,
  routing_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_executions_card ON public.card_executions(card_id);
CREATE INDEX IF NOT EXISTS idx_card_executions_step ON public.card_executions(board_step_id);

-- ============================================================
-- 6. RLS POLICIES
-- ============================================================

-- Board Templates: system templates readable by all, user templates scoped to account
ALTER TABLE public.board_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view system/published templates" ON public.board_templates
  FOR SELECT USING (
    is_system = TRUE OR is_published = TRUE
    OR account_id IN (SELECT get_auth_user_account_ids())
  );

CREATE POLICY "Users can manage their account templates" ON public.board_templates
  FOR ALL USING (
    account_id IN (SELECT get_auth_user_account_ids())
  );

-- Board Instances: scoped to account
ALTER TABLE public.board_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view boards in their accounts" ON public.board_instances
  FOR SELECT USING (
    account_id IN (SELECT get_auth_user_account_ids())
  );

CREATE POLICY "Users can manage boards in their accounts" ON public.board_instances
  FOR ALL USING (
    account_id IN (SELECT get_auth_user_account_ids())
  );

-- Board Steps: inherit access from board instance
ALTER TABLE public.board_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view steps of their boards" ON public.board_steps
  FOR SELECT USING (
    board_instance_id IN (
      SELECT id FROM public.board_instances
      WHERE account_id IN (SELECT get_auth_user_account_ids())
    )
  );

CREATE POLICY "Users can manage steps of their boards" ON public.board_steps
  FOR ALL USING (
    board_instance_id IN (
      SELECT id FROM public.board_instances
      WHERE account_id IN (SELECT get_auth_user_account_ids())
    )
  );

-- Card Executions: inherit access from task
ALTER TABLE public.card_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view executions of their tasks" ON public.card_executions
  FOR SELECT USING (
    card_id IN (
      SELECT id FROM public.tasks
      WHERE account_id IN (SELECT get_auth_user_account_ids())
    )
  );

-- ============================================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_board_templates_updated_at
  BEFORE UPDATE ON public.board_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_board_instances_updated_at
  BEFORE UPDATE ON public.board_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_board_steps_updated_at
  BEFORE UPDATE ON public.board_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 8. GRANT PERMISSIONS (service_role + authenticated)
-- ============================================================
GRANT ALL ON public.board_templates TO service_role;
GRANT ALL ON public.board_instances TO service_role;
GRANT ALL ON public.board_steps TO service_role;
GRANT ALL ON public.card_executions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_steps TO authenticated;
GRANT SELECT ON public.card_executions TO authenticated;
