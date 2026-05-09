-- F10: Migrate pilot_configs into agents (type='pilot'), add pilot_agent_id to pods
-- Check if pilot_configs table exists before migrating
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pilot_configs') THEN
    -- For each pilot_config row, create an agent with type='pilot'
    INSERT INTO agents (
      account_id,
      name,
      slug,
      persona,
      backbone_connection_id,
      agent_type,
      status,
      is_active,
      config,
      created_at,
      updated_at
    )
    SELECT
      pc.account_id,
      COALESCE(pc.name, 'Cockpit AI'),
      lower(regexp_replace(COALESCE(pc.name, 'cockpit-ai'), '[^a-zA-Z0-9]+', '-', 'g')),
      pc.system_prompt,
      pc.backbone_connection_id,
      'pilot',
      'idle',
      true,
      jsonb_build_object(
        'max_tasks_per_cycle', pc.max_tasks_per_cycle,
        'approval_required', pc.approval_required,
        'migrated_from_pilot_config_id', pc.id
      ),
      pc.created_at,
      pc.updated_at
    FROM pilot_configs pc
    WHERE NOT EXISTS (
      SELECT 1 FROM agents a
      WHERE a.account_id = pc.account_id
        AND a.agent_type = 'pilot'
        AND a.config->>'migrated_from_pilot_config_id' = pc.id::text
    )
    ON CONFLICT (account_id, slug) DO NOTHING;
  END IF;
END $$;

-- Add pilot_agent_id FK to pods table
ALTER TABLE pods
  ADD COLUMN IF NOT EXISTS pilot_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pods_pilot_agent ON pods(pilot_agent_id)
  WHERE pilot_agent_id IS NOT NULL;

-- Wire up existing pods to their pilot agents (via pilot_configs if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pilot_configs')
     AND EXISTS (SELECT FROM information_schema.columns WHERE table_name='pilot_configs' AND column_name='pod_id') THEN
    UPDATE pods p
    SET pilot_agent_id = a.id
    FROM agents a
    WHERE (a.config->>'migrated_from_pilot_config_id') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM pilot_configs pc
        WHERE pc.id::text = a.config->>'migrated_from_pilot_config_id'
          AND pc.pod_id = p.id
      )
      AND p.pilot_agent_id IS NULL;
  END IF;
END $$;
