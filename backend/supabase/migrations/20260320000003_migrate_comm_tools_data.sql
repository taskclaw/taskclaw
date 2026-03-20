-- ═══════════════════════════════════════════════════════════
-- Integration Unification: Migrate comm_tool_integrations → integration_connections
-- ═══════════════════════════════════════════════════════════
-- Migrates existing comm_tool_integrations rows into the unified
-- integration_connections table, linking them to the new comm definitions
-- (telegram-comm, whatsapp-comm, slack-comm).

DO $$
DECLARE
  comm_rec RECORD;
  def_id UUID;
  existing_conn_id UUID;
  tool_slug TEXT;
BEGIN
  FOR comm_rec IN
    SELECT * FROM public.comm_tool_integrations
  LOOP
    -- Map tool_type to new definition slug
    tool_slug := comm_rec.tool_type || '-comm';

    -- Find the system definition
    SELECT id INTO def_id
    FROM public.integration_definitions
    WHERE slug = tool_slug AND is_system = true
    LIMIT 1;

    IF def_id IS NULL THEN CONTINUE; END IF;

    -- Check if connection already exists
    SELECT id INTO existing_conn_id
    FROM public.integration_connections
    WHERE account_id = comm_rec.account_id AND definition_id = def_id;

    IF existing_conn_id IS NULL THEN
      INSERT INTO public.integration_connections (
        account_id, definition_id, credentials, status,
        config, health_status, last_checked_at, last_healthy_at,
        check_interval_minutes
      ) VALUES (
        comm_rec.account_id,
        def_id,
        NULL,
        CASE WHEN comm_rec.is_enabled THEN 'active' ELSE 'pending' END,
        COALESCE(comm_rec.config, '{}'),
        COALESCE(comm_rec.health_status, 'unknown'),
        comm_rec.last_checked_at,
        comm_rec.last_healthy_at,
        COALESCE(comm_rec.check_interval_minutes, 5)
      );
    END IF;
  END LOOP;
END $$;
