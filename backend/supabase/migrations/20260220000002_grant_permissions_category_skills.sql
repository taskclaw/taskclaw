-- Fix missing GRANT permissions for category_skills, provider_agents, agent_sync_logs
-- The service_role needs explicit table-level GRANT to access these tables

-- =====================================================
-- 1. category_skills — was missing GRANT since creation
-- =====================================================
GRANT ALL ON public.category_skills TO authenticated, service_role;

-- =====================================================
-- 2. provider_agents — new table, also needs GRANT
-- =====================================================
GRANT ALL ON public.provider_agents TO authenticated, service_role;

-- =====================================================
-- 3. agent_sync_logs — new table, also needs GRANT
-- =====================================================
GRANT ALL ON public.agent_sync_logs TO authenticated, service_role;
