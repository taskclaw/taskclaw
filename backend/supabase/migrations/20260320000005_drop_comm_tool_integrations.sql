-- ═══════════════════════════════════════════════════════════
-- Integration Unification: Drop legacy comm_tool_integrations table
-- ═══════════════════════════════════════════════════════════
-- All data has been migrated to integration_connections
-- by migration 20260320000003_migrate_comm_tools_data.sql

DROP TABLE IF EXISTS public.comm_tool_integrations;
