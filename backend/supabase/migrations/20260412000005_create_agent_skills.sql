-- F04: Create agent_skills junction table (replaces category_skills)
CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id  uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id  uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  PRIMARY KEY (agent_id, skill_id)
);

ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see agent_skills in their accounts" ON agent_skills
    FOR SELECT USING (
      agent_id IN (
        SELECT id FROM agents WHERE account_id IN (SELECT get_auth_user_account_ids())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage agent_skills" ON agent_skills
    FOR ALL USING (
      agent_id IN (
        SELECT id FROM agents WHERE account_id IN (
          SELECT au.account_id FROM account_users au
          WHERE au.user_id = auth.uid() AND au.role IN ('owner', 'admin')
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_agent_skills_agent_id ON agent_skills(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_skills_skill_id ON agent_skills(skill_id);

-- Migration: copy category_skills -> agent_skills using migrated_from_category_id
INSERT INTO agent_skills (agent_id, skill_id, is_active)
SELECT a.id, cs.skill_id, cs.is_active
FROM category_skills cs
JOIN agents a ON a.migrated_from_category_id = cs.category_id
WHERE NOT EXISTS (
  SELECT 1 FROM agent_skills ags
  WHERE ags.agent_id = a.id AND ags.skill_id = cs.skill_id
);
