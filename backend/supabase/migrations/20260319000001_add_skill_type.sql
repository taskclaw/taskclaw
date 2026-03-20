-- Add skill_type column to skills table
-- Classifies skills: general (default), integration, board, system

ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS skill_type VARCHAR(30) DEFAULT 'general'
    CHECK (skill_type IN ('general', 'integration', 'board', 'system'));

-- Index for filtering by skill_type
CREATE INDEX IF NOT EXISTS idx_skills_type
  ON public.skills(skill_type);

-- Composite index for account + type queries
CREATE INDEX IF NOT EXISTS idx_skills_account_type
  ON public.skills(account_id, skill_type);

COMMENT ON COLUMN public.skills.skill_type IS
  'Classifies the skill: general (user-created), integration (linked to an integration), board (board-specific), system (platform-provided)';
