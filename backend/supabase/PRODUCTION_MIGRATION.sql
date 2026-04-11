-- =============================================================================
-- TASKCLAW PRODUCTION DATABASE - COMPLETE MIGRATION
-- =============================================================================
-- Run this in Supabase SQL Editor on a FRESH database.
-- This combines all 27 migrations + updated seed data.
-- Super Admin: super@taskclaw.co / <password set via GoTrue admin API>
-- =============================================================================

-- =============================================================================
-- PART 1: EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- PART 2: CORE SCHEMA (consolidated_schema)
-- =============================================================================

-- 1.1 users (profile table, separate from auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.2 accounts
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.3 account_users
CREATE TABLE account_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (account_id, user_id)
);

-- 1.4 projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.5 project_users
CREATE TABLE project_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- 1.6 plans
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  interval TEXT CHECK (interval IN ('month', 'year')) NOT NULL,
  features JSONB,
  is_default BOOLEAN DEFAULT false,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.7 subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id),
  status TEXT CHECK (status IN ('trialing','active','past_due','canceled')),
  provider TEXT DEFAULT 'stripe',
  provider_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.8 invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT CHECK (role IN ('owner', 'admin', 'member')) NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, email)
);

-- 1.9 system_settings
CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "allow_multiple_projects" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "system_settings_id_check" CHECK (id)
);

-- =============================================================================
-- PART 3: FUNCTIONS & TRIGGERS
-- =============================================================================

-- handle_new_user (Trigger Function)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_account_id UUID;
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (coalesce(new.raw_user_meta_data->>'full_name', 'My Account') || '''s Team', new.id)
  RETURNING id INTO new_account_id;

  INSERT INTO public.account_users (account_id, user_id, role)
  VALUES (new_account_id, new.id, 'owner');

  RETURN new;
END;
$$;

-- on_auth_user_created trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Helper RLS functions
CREATE OR REPLACE FUNCTION get_auth_user_account_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT account_id FROM account_users WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_member_projects()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT project_id FROM project_users WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_admin_projects()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.id
  FROM projects p
  JOIN account_users au ON p.account_id = au.account_id
  WHERE au.user_id = auth.uid() AND au.role IN ('owner', 'admin');
$$;

CREATE OR REPLACE FUNCTION get_auth_user_project_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT project_id FROM project_users WHERE user_id = auth.uid()
  UNION
  SELECT p.id
  FROM projects p
  JOIN account_users au ON p.account_id = au.account_id
  WHERE au.user_id = auth.uid() AND au.role IN ('owner', 'admin');
$$;

CREATE OR REPLACE FUNCTION is_account_admin_for_project(lookup_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM projects p
    JOIN account_users au ON p.account_id = au.account_id
    WHERE p.id = lookup_project_id
    AND au.user_id = auth.uid()
    AND au.role IN ('owner', 'admin')
  );
$$;

-- update_updated_at_column function (used by many triggers)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PART 4: RLS POLICIES (Core Tables)
-- =============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Users
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Accounts
CREATE POLICY "Users can view accounts they belong to" ON accounts
  FOR SELECT USING (id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can create accounts" ON accounts
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Account members can update account" ON accounts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM account_users
      WHERE account_users.account_id = accounts.id
      AND account_users.user_id = auth.uid()
      AND account_users.role IN ('owner', 'admin')
    )
  );

-- Account Users
CREATE POLICY "Users can view members of their accounts" ON account_users
  FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can join accounts they own" ON account_users
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM accounts WHERE id = account_id AND owner_user_id = auth.uid()
    )
  );

-- Projects
CREATE POLICY "Users can view projects" ON projects
  FOR SELECT USING (id IN (SELECT get_auth_user_project_ids()));
CREATE POLICY "Users can create projects" ON projects
  FOR INSERT WITH CHECK (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can update projects" ON projects
  FOR UPDATE USING (
    id IN (SELECT get_admin_projects())
    OR EXISTS (
      SELECT 1 FROM project_users
      WHERE project_users.project_id = projects.id
      AND project_users.user_id = auth.uid()
      AND project_users.role = 'admin'
    )
  );
CREATE POLICY "Users can delete projects" ON projects
  FOR DELETE USING (
    id IN (SELECT get_admin_projects())
    OR EXISTS (
      SELECT 1 FROM project_users
      WHERE project_users.project_id = projects.id
      AND project_users.user_id = auth.uid()
      AND project_users.role = 'admin'
    )
  );

-- Project Users
CREATE POLICY "Users can view project members" ON project_users
  FOR SELECT USING (project_id IN (SELECT get_auth_user_project_ids()));
CREATE POLICY "Users can add project members" ON project_users
  FOR INSERT WITH CHECK (project_id IN (SELECT get_admin_projects()));
CREATE POLICY "Users can manage project members" ON project_users
  FOR ALL USING (
    is_account_admin_for_project(project_id)
    OR EXISTS (
      SELECT 1 FROM project_users pu
      WHERE pu.project_id = project_users.project_id
      AND pu.user_id = auth.uid()
      AND pu.role = 'admin'
    )
  );

-- Plans
CREATE POLICY "Plans are publicly readable" ON plans
  FOR SELECT USING (true);

-- Subscriptions
CREATE POLICY "Users can view subscriptions of their accounts" ON subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_users
      WHERE account_users.account_id = subscriptions.account_id
      AND account_users.user_id = auth.uid()
    )
  );

-- Invitations
CREATE POLICY "Account admins can view invitations" ON invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_users
      WHERE account_users.account_id = invitations.account_id
      AND account_users.user_id = auth.uid()
      AND account_users.role IN ('owner', 'admin')
    )
  );
CREATE POLICY "Account admins can create invitations" ON invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_users
      WHERE account_users.account_id = invitations.account_id
      AND account_users.user_id = auth.uid()
      AND account_users.role IN ('owner', 'admin')
    )
  );

-- System Settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to authenticated users" ON "public"."system_settings"
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow update access to super admins" ON "public"."system_settings"
    FOR UPDATE TO authenticated USING (
        (auth.jwt() ->> 'role') = 'super_admin' OR
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
    );

GRANT ALL ON TABLE "public"."system_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."system_settings" TO "authenticated";
GRANT SELECT ON TABLE "public"."system_settings" TO "anon";

INSERT INTO "public"."system_settings" ("id", "allow_multiple_projects")
VALUES (true, true)
ON CONFLICT ("id") DO NOTHING;

-- =============================================================================
-- PART 5: USER STATUS (migration 20251221)
-- =============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_status_check
      CHECK (status IN ('pending', 'active', 'suspended'));
  END IF;
END
$$;

UPDATE public.users SET status = 'active' WHERE status IS NULL;
ALTER TABLE public.users ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.users ALTER COLUMN status SET NOT NULL;

-- =============================================================================
-- PART 6: THEME SETTINGS (migration 20260123)
-- =============================================================================

ALTER TABLE "public"."system_settings"
ADD COLUMN IF NOT EXISTS "theme_set" TEXT DEFAULT 'corporate',
ADD COLUMN IF NOT EXISTS "extended_settings" JSONB DEFAULT '{}';

ALTER TABLE "public"."system_settings"
ADD CONSTRAINT "valid_theme_set"
CHECK (theme_set IN ('corporate', 'funky', 'blue', 'red', 'ocean-blue', 'ruby-red', 'emerald-green', 'amber-gold'));

CREATE INDEX IF NOT EXISTS "idx_system_settings_extended"
ON "public"."system_settings" USING GIN ("extended_settings");

UPDATE "public"."system_settings"
SET
    theme_set = COALESCE(theme_set, 'corporate'),
    extended_settings = COALESCE(extended_settings, '{}')
WHERE id = true;

-- =============================================================================
-- PART 7: EXEC_SQL FUNCTION (migration 20260128)
-- =============================================================================

CREATE OR REPLACE FUNCTION exec_sql(query_text TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  IF lower(query_text) ~ '\s*(insert|update|delete|drop|alter|truncate|create|grant|revoke)\s+' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed.';
  END IF;
  EXECUTE 'select json_agg(t) from (' || query_text || ') t' INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION exec_sql(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;

-- =============================================================================
-- PART 8: AI CONVERSATIONS & MESSAGES (legacy tables, migration 20260128)
-- =============================================================================

CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT,
  tool_calls JSONB,
  tool_call_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view conversations"
  ON ai_conversations FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "Users can insert their own conversations"
  ON ai_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own conversations"
  ON ai_conversations FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own conversations"
  ON ai_conversations FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view messages of conversations"
  ON ai_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE ai_conversations.id = ai_messages.conversation_id
      AND (ai_conversations.user_id = auth.uid() OR ai_conversations.is_public = true)
    )
  );
CREATE POLICY "Users can insert messages to their conversations"
  ON ai_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE ai_conversations.id = ai_messages.conversation_id
      AND ai_conversations.user_id = auth.uid()
    )
  );

CREATE INDEX idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX idx_ai_messages_conversation_id ON ai_messages(conversation_id);

-- =============================================================================
-- PART 9: ALLOW MULTIPLE TEAMS (migration 20260129)
-- =============================================================================

ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS allow_multiple_teams BOOLEAN DEFAULT true;

-- =============================================================================
-- PART 10: VECTOR SEARCH (migration 20260131)
-- =============================================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS description_embedding vector(1536);
ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS content_embedding vector(1536);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_projects_description_embedding
  ON projects USING hnsw (description_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_ai_messages_content_embedding
  ON ai_messages USING hnsw (content_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_users_profile_embedding
  ON users USING hnsw (profile_embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION search_projects_vector(
  query_embedding vector(1536),
  match_limit INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID, name TEXT, description TEXT, account_id UUID, created_at TIMESTAMPTZ, similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.description, p.account_id, p.created_at,
    1 - (p.description_embedding <=> query_embedding) AS similarity
  FROM projects p
  WHERE p.description_embedding IS NOT NULL
    AND 1 - (p.description_embedding <=> query_embedding) > similarity_threshold
  ORDER BY p.description_embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

CREATE OR REPLACE FUNCTION search_messages_vector(
  query_embedding vector(1536),
  conversation_id_filter UUID DEFAULT NULL,
  match_limit INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID, conversation_id UUID, role TEXT, content TEXT, created_at TIMESTAMPTZ, similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.conversation_id, m.role, m.content, m.created_at,
    1 - (m.content_embedding <=> query_embedding) AS similarity
  FROM ai_messages m
  WHERE m.content_embedding IS NOT NULL
    AND (conversation_id_filter IS NULL OR m.conversation_id = conversation_id_filter)
    AND 1 - (m.content_embedding <=> query_embedding) > similarity_threshold
  ORDER BY m.content_embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

CREATE OR REPLACE FUNCTION search_users_vector(
  query_embedding vector(1536),
  match_limit INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID, email TEXT, name TEXT, created_at TIMESTAMPTZ, similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email, u.name, u.created_at,
    1 - (u.profile_embedding <=> query_embedding) AS similarity
  FROM users u
  WHERE u.profile_embedding IS NOT NULL
    AND 1 - (u.profile_embedding <=> query_embedding) > similarity_threshold
  ORDER BY u.profile_embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

CREATE OR REPLACE FUNCTION check_embeddings_status()
RETURNS TABLE (table_name TEXT, total_rows BIGINT, rows_with_embeddings BIGINT, percentage FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 'projects'::TEXT, count(*)::BIGINT, count(description_embedding)::BIGINT,
    (count(description_embedding)::FLOAT / nullif(count(*), 0)::FLOAT * 100) FROM projects
  UNION ALL
  SELECT 'ai_messages'::TEXT, count(*)::BIGINT, count(content_embedding)::BIGINT,
    (count(content_embedding)::FLOAT / nullif(count(*), 0)::FLOAT * 100) FROM ai_messages
  UNION ALL
  SELECT 'users'::TEXT, count(*)::BIGINT, count(profile_embedding)::BIGINT,
    (count(profile_embedding)::FLOAT / nullif(count(*), 0)::FLOAT * 100) FROM users;
END;
$$;

GRANT EXECUTE ON FUNCTION search_projects_vector(vector, INT, FLOAT) TO authenticated;
GRANT EXECUTE ON FUNCTION search_messages_vector(vector, UUID, INT, FLOAT) TO authenticated;
GRANT EXECUTE ON FUNCTION search_users_vector(vector, INT, FLOAT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_embeddings_status() TO authenticated;

-- =============================================================================
-- PART 11: OTT CORE TABLES (migration 20260212)
-- =============================================================================

-- Categories
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, name)
);

-- Sources
CREATE TABLE IF NOT EXISTS public.sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('notion', 'clickup', 'trello', 'local')),
  config JSONB NOT NULL DEFAULT '{}',
  sync_status TEXT NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error', 'disabled')),
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  sync_interval_minutes INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tasks
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'To-Do',
  priority TEXT DEFAULT 'Medium',
  completed BOOLEAN DEFAULT false,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  external_url TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_id, external_id)
);

-- Task status/priority constraints (final version with all statuses)
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('To-Do', 'Today', 'In Progress', 'AI Running', 'In Review', 'Done', 'Blocked'));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('High', 'Medium', 'Low', 'Urgent'));

-- Sync Jobs
CREATE TABLE IF NOT EXISTS public.sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  tasks_synced INTEGER DEFAULT 0,
  tasks_created INTEGER DEFAULT 0,
  tasks_updated INTEGER DEFAULT 0,
  tasks_deleted INTEGER DEFAULT 0,
  error_log TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_categories_account_id ON public.categories(account_id);
CREATE INDEX IF NOT EXISTS idx_sources_account_id ON public.sources(account_id);
CREATE INDEX IF NOT EXISTS idx_sources_category_id ON public.sources(category_id);
CREATE INDEX IF NOT EXISTS idx_sources_sync_status ON public.sources(sync_status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tasks_account_id ON public.tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_tasks_category_id ON public.tasks(category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_source_id ON public.tasks(source_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_external_id ON public.tasks(source_id, external_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON public.tasks(completed);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_source_id ON public.sync_jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON public.sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_started_at ON public.sync_jobs(started_at DESC);

-- RLS for categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view categories in their accounts" ON public.categories
  FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can create categories in their accounts" ON public.categories
  FOR INSERT WITH CHECK (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can update categories in their accounts" ON public.categories
  FOR UPDATE USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can delete categories in their accounts" ON public.categories
  FOR DELETE USING (account_id IN (SELECT get_auth_user_account_ids()));

-- RLS for sources
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view sources in their accounts" ON public.sources
  FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can create sources in their accounts" ON public.sources
  FOR INSERT WITH CHECK (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can update sources in their accounts" ON public.sources
  FOR UPDATE USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can delete sources in their accounts" ON public.sources
  FOR DELETE USING (account_id IN (SELECT get_auth_user_account_ids()));

-- RLS for tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tasks in their accounts" ON public.tasks
  FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can create tasks in their accounts" ON public.tasks
  FOR INSERT WITH CHECK (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can update tasks in their accounts" ON public.tasks
  FOR UPDATE USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can delete tasks in their accounts" ON public.tasks
  FOR DELETE USING (account_id IN (SELECT get_auth_user_account_ids()));

-- RLS for sync_jobs
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view sync jobs for their sources" ON public.sync_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sources
      WHERE sources.id = sync_jobs.source_id
      AND sources.account_id IN (SELECT get_auth_user_account_ids())
    )
  );
CREATE POLICY "Service role can manage sync jobs" ON public.sync_jobs
  FOR ALL USING (true) WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON public.sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grants
GRANT ALL ON public.categories TO authenticated, service_role;
GRANT ALL ON public.sources TO authenticated, service_role;
GRANT ALL ON public.tasks TO authenticated, service_role;
GRANT ALL ON public.sync_jobs TO authenticated, service_role;
GRANT SELECT ON public.sync_jobs TO anon;

-- =============================================================================
-- PART 12: AI PROVIDER CONFIGS (migration 20260213000001)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_provider_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL DEFAULT 'openclaw',
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  agent_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, provider_type)
);

CREATE INDEX idx_ai_provider_configs_account_id ON public.ai_provider_configs(account_id);
CREATE INDEX idx_ai_provider_configs_is_active ON public.ai_provider_configs(is_active) WHERE is_active = TRUE;

ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view AI configs in their accounts" ON public.ai_provider_configs
  FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Account owners can create AI configs" ON public.ai_provider_configs
  FOR INSERT WITH CHECK (
    account_id IN (SELECT account_id FROM public.account_users WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );
CREATE POLICY "Account owners can update AI configs" ON public.ai_provider_configs
  FOR UPDATE USING (
    account_id IN (SELECT account_id FROM public.account_users WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );
CREATE POLICY "Account owners can delete AI configs" ON public.ai_provider_configs
  FOR DELETE USING (
    account_id IN (SELECT account_id FROM public.account_users WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE TRIGGER update_ai_provider_configs_updated_at
  BEFORE UPDATE ON public.ai_provider_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- PART 13: CONVERSATIONS (migration 20260213000002)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  title TEXT,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_account_id ON public.conversations(account_id);
CREATE INDEX idx_conversations_task_id ON public.conversations(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_conversations_user_updated ON public.conversations(user_id, updated_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversations" ON public.conversations
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create conversations in their accounts" ON public.conversations
  FOR INSERT WITH CHECK (user_id = auth.uid() AND account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can update their own conversations" ON public.conversations
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own conversations" ON public.conversations
  FOR DELETE USING (user_id = auth.uid());

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations SET updated_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 14: MESSAGES (migration 20260213000003)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_conversation_created ON public.messages(conversation_id, created_at ASC);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in their conversations" ON public.messages
  FOR SELECT USING (conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()));
CREATE POLICY "Users can create messages in their conversations" ON public.messages
  FOR INSERT WITH CHECK (conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()));
CREATE POLICY "Users can update messages in their conversations" ON public.messages
  FOR UPDATE USING (conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete messages in their conversations" ON public.messages
  FOR DELETE USING (conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()));

CREATE TRIGGER update_conversation_on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();

-- =============================================================================
-- PART 15: KNOWLEDGE DOCS (migration 20260213000004)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.knowledge_docs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_master BOOLEAN DEFAULT FALSE,
  file_attachments JSONB DEFAULT '[]',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT knowledge_docs_title_not_empty CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT knowledge_docs_content_size CHECK (CHAR_LENGTH(content) <= 102400)
);

CREATE INDEX idx_knowledge_docs_account_id ON public.knowledge_docs(account_id);
CREATE INDEX idx_knowledge_docs_category_id ON public.knowledge_docs(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_knowledge_docs_master ON public.knowledge_docs(account_id, category_id, is_master) WHERE is_master = TRUE;
CREATE INDEX idx_knowledge_docs_updated ON public.knowledge_docs(account_id, updated_at DESC);
CREATE UNIQUE INDEX idx_knowledge_docs_unique_master ON public.knowledge_docs(account_id, category_id) WHERE is_master = TRUE AND category_id IS NOT NULL;
CREATE UNIQUE INDEX idx_knowledge_docs_unique_master_uncategorized ON public.knowledge_docs(account_id) WHERE is_master = TRUE AND category_id IS NULL;

ALTER TABLE public.knowledge_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view knowledge docs in their accounts" ON public.knowledge_docs
  FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can create knowledge docs in their accounts" ON public.knowledge_docs
  FOR INSERT WITH CHECK (account_id IN (SELECT get_auth_user_account_ids()) AND created_by = auth.uid());
CREATE POLICY "Users can update knowledge docs in their accounts" ON public.knowledge_docs
  FOR UPDATE USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can delete knowledge docs in their accounts" ON public.knowledge_docs
  FOR DELETE USING (account_id IN (SELECT get_auth_user_account_ids()));

CREATE OR REPLACE FUNCTION ensure_single_master_doc()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_master = TRUE THEN
    IF NEW.category_id IS NOT NULL THEN
      UPDATE public.knowledge_docs SET is_master = FALSE
      WHERE account_id = NEW.account_id AND category_id = NEW.category_id AND id != NEW.id AND is_master = TRUE;
    ELSE
      UPDATE public.knowledge_docs SET is_master = FALSE
      WHERE account_id = NEW.account_id AND category_id IS NULL AND id != NEW.id AND is_master = TRUE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_ensure_single_master_doc
  BEFORE INSERT OR UPDATE OF is_master ON public.knowledge_docs
  FOR EACH ROW WHEN (NEW.is_master = TRUE)
  EXECUTE FUNCTION ensure_single_master_doc();

CREATE TRIGGER update_knowledge_docs_updated_at
  BEFORE UPDATE ON public.knowledge_docs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- PART 16: SKILLS (migration 20260213000005)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT skills_name_not_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT skills_instructions_size CHECK (CHAR_LENGTH(instructions) <= 51200),
  CONSTRAINT skills_unique_name_per_account UNIQUE(account_id, name)
);

CREATE INDEX idx_skills_account_id ON public.skills(account_id);
CREATE INDEX idx_skills_active ON public.skills(account_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_skills_name ON public.skills(account_id, name);

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view skills in their accounts" ON public.skills
  FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can create skills in their accounts" ON public.skills
  FOR INSERT WITH CHECK (account_id IN (SELECT get_auth_user_account_ids()) AND created_by = auth.uid());
CREATE POLICY "Users can update skills in their accounts" ON public.skills
  FOR UPDATE USING (account_id IN (SELECT get_auth_user_account_ids()));
CREATE POLICY "Users can delete skills in their accounts" ON public.skills
  FOR DELETE USING (account_id IN (SELECT get_auth_user_account_ids()));

CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- PART 17: CATEGORY-SKILLS JUNCTION (migration 20260213000006)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.category_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT category_skills_unique UNIQUE(category_id, skill_id)
);

CREATE INDEX idx_category_skills_category ON public.category_skills(category_id);
CREATE INDEX idx_category_skills_skill ON public.category_skills(skill_id);

ALTER TABLE public.category_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view category skills in their accounts" ON public.category_skills
  FOR SELECT USING (category_id IN (SELECT id FROM public.categories WHERE account_id IN (SELECT get_auth_user_account_ids())));
CREATE POLICY "Users can create category skills in their accounts" ON public.category_skills
  FOR INSERT WITH CHECK (
    category_id IN (SELECT id FROM public.categories WHERE account_id IN (SELECT get_auth_user_account_ids()))
    AND skill_id IN (SELECT id FROM public.skills WHERE account_id IN (SELECT get_auth_user_account_ids()))
  );
CREATE POLICY "Users can delete category skills in their accounts" ON public.category_skills
  FOR DELETE USING (category_id IN (SELECT id FROM public.categories WHERE account_id IN (SELECT get_auth_user_account_ids())));

CREATE OR REPLACE FUNCTION get_category_default_skills(p_category_id UUID)
RETURNS TABLE (skill_id UUID, name TEXT, instructions TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.name, s.instructions
  FROM public.skills s
  INNER JOIN public.category_skills cs ON cs.skill_id = s.id
  WHERE cs.category_id = p_category_id AND s.is_active = TRUE
  ORDER BY s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 18: SAAS LAYER (migration 20260214000001)
-- =============================================================================

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-attachments', 'knowledge-attachments', false) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload knowledge attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'knowledge-attachments');

CREATE POLICY "Users can view knowledge attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'knowledge-attachments');

CREATE POLICY "Users can delete knowledge attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'knowledge-attachments');

GRANT ALL ON public.knowledge_docs TO anon, authenticated, service_role;
GRANT ALL ON public.skills TO anon, authenticated, service_role;

-- =============================================================================
-- PART 19: CATEGORY VISIBILITY & SOURCE FILTERS (migration 20260214100000)
-- =============================================================================

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS sync_filters JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS category_property TEXT DEFAULT NULL;

GRANT ALL ON public.categories TO authenticated, service_role;
GRANT ALL ON public.sources TO authenticated, service_role;

-- =============================================================================
-- PART 20: OPENCLAW EXTENDED CREDENTIALS (migration 20260214200000)
-- =============================================================================

ALTER TABLE public.ai_provider_configs
  ADD COLUMN IF NOT EXISTS openrouter_api_key TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brave_search_api_key TEXT DEFAULT NULL;

-- =============================================================================
-- PART 21: STRIPE COLUMNS (migrations 20260215000000 + 20260215000001)
-- =============================================================================

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_account_id_key'
    ) THEN
        ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_account_id_key UNIQUE (account_id);
    END IF;
END
$$;

-- =============================================================================
-- PART 22: WAITLIST (migration 20260217000001)
-- =============================================================================

CREATE TABLE public.waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'landing_page',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_waitlist_email ON public.waitlist (email);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join waitlist" ON public.waitlist
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can read waitlist" ON public.waitlist
  FOR SELECT USING (auth.role() = 'service_role');

-- =============================================================================
-- PART 23: SEED DATA
-- =============================================================================

-- Seed plans
INSERT INTO plans (name, price_cents, currency, interval, features) VALUES
('Hobby', 0, 'usd', 'month', '["Up to 3 projects", "Basic analytics", "Community support"]'),
('Pro', 2900, 'usd', 'month', '["Unlimited projects", "Advanced analytics", "Priority support", "Team members"]'),
('Enterprise', 9900, 'usd', 'month', '["SSO", "Audit logs", "Dedicated account manager", "SLA"]');

-- Seed Super Admin: super@taskclaw.co / <password set via GoTrue admin API>
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'd0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d',
    'authenticated',
    'authenticated',
    'super@taskclaw.co',
    '$2b$10$2N0zQZZ8GHWC82KKnPacceMznLblh7CoWvT424Vx3iO0XwBiNSa72',
    now(),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"], "role": "super_admin"}'::jsonb,
    '{"full_name": "TaskClaw Admin"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
) ON CONFLICT (id) DO NOTHING;

-- Also insert into auth.identities (required by Supabase GoTrue for email login)
INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
) VALUES (
    'd0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d',
    'd0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d',
    'super@taskclaw.co',
    '{"sub": "d0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d", "email": "super@taskclaw.co", "email_verified": true, "phone_verified": false}'::jsonb,
    'email',
    now(),
    now(),
    now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- The trigger should fire and create public.users + accounts + account_users.
-- But in case it doesn't (direct SQL insert may bypass triggers in some Supabase configs):
INSERT INTO public.users (id, email, name, status)
VALUES ('d0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d', 'super@taskclaw.co', 'TaskClaw Admin', 'active')
ON CONFLICT (id) DO UPDATE SET status = 'active';

INSERT INTO public.accounts (id, name, owner_user_id, onboarding_completed)
VALUES ('a0a8c19c-3b36-4423-8c5d-5d5d5d5d5d5d', 'TaskClaw Admin''s Team', 'd0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.account_users (account_id, user_id, role)
VALUES ('a0a8c19c-3b36-4423-8c5d-5d5d5d5d5d5d', 'd0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d', 'owner')
ON CONFLICT (account_id, user_id) DO NOTHING;

-- Mark onboarding completed
UPDATE public.accounts SET onboarding_completed = true WHERE id = 'a0a8c19c-3b36-4423-8c5d-5d5d5d5d5d5d';

-- Insert default system settings row
INSERT INTO "public"."system_settings" ("id", "allow_multiple_projects")
VALUES (true, true)
ON CONFLICT ("id") DO NOTHING;

-- =============================================================================
-- DONE! All 27 migrations applied + seed data created.
-- Super Admin: super@taskclaw.co / <password set via GoTrue admin API>
-- =============================================================================
