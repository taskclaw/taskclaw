-- F044: Migrate existing board integrations from settings_override/installed_manifest
-- to the new integration_definitions, integration_connections, board_integration_refs tables.
--
-- Existing data model:
--   board_instances.installed_manifest.integrations = array of definition-like objects
--     { slug, name, description, icon, required, setup_guide, config_fields[] }
--   board_instances.settings_override.integrations = { [slug]: { enabled, config, test_status, last_tested_at } }
--     where config has potentially pre-encrypted password-type field values
--
-- Migration strategy:
--   1. For each board, iterate over installed_manifest.integrations
--   2. Create/find integration_definitions (per account + slug, not system)
--   3. If settings_override has runtime config for this slug with actual values,
--      create an integration_connection with credentials re-encrypted as a single blob
--   4. Create board_integration_refs linking the board to the connection

DO $$
DECLARE
  board_rec RECORD;
  def_rec JSONB;
  slug_val TEXT;
  name_val TEXT;
  desc_val TEXT;
  icon_val TEXT;
  setup_val TEXT;
  config_fields_val JSONB;
  required_val BOOLEAN;
  runtime_config JSONB;
  runtime_enabled BOOLEAN;
  raw_config JSONB;
  existing_def_id UUID;
  new_def_id UUID;
  existing_conn_id UUID;
  new_conn_id UUID;
  cred_key TEXT;
  cred_val TEXT;
  cred_obj JSONB;
  field_rec JSONB;
  field_type TEXT;
  has_any_value BOOLEAN;
BEGIN
  -- Iterate over all boards that have integrations in their manifest
  FOR board_rec IN
    SELECT
      id,
      account_id,
      installed_manifest,
      settings_override
    FROM public.board_instances
    WHERE installed_manifest IS NOT NULL
      AND installed_manifest->'integrations' IS NOT NULL
      AND jsonb_array_length(COALESCE(installed_manifest->'integrations', '[]'::jsonb)) > 0
  LOOP
    -- Iterate over each integration definition in the manifest
    FOR def_rec IN SELECT * FROM jsonb_array_elements(board_rec.installed_manifest->'integrations')
    LOOP
      slug_val := def_rec->>'slug';
      name_val := def_rec->>'name';
      desc_val := def_rec->>'description';
      icon_val := def_rec->>'icon';
      setup_val := def_rec->>'setup_guide';
      config_fields_val := COALESCE(def_rec->'config_fields', '[]'::jsonb);
      required_val := COALESCE((def_rec->>'required')::boolean, false);

      -- Skip if slug is null
      IF slug_val IS NULL THEN
        CONTINUE;
      END IF;

      -- Check if definition already exists for this account + slug
      SELECT id INTO existing_def_id
      FROM public.integration_definitions
      WHERE account_id = board_rec.account_id AND slug = slug_val;

      IF existing_def_id IS NULL THEN
        INSERT INTO public.integration_definitions (
          account_id, slug, name, description, icon,
          auth_type, auth_config, config_fields,
          setup_guide, is_system
        ) VALUES (
          board_rec.account_id,
          slug_val,
          COALESCE(name_val, slug_val),
          desc_val,
          icon_val,
          'api_key', -- existing integrations are all api_key type
          jsonb_build_object('key_fields', config_fields_val),
          config_fields_val,
          setup_val,
          false
        )
        RETURNING id INTO new_def_id;
      ELSE
        new_def_id := existing_def_id;
      END IF;

      -- Check for runtime config (credentials)
      runtime_config := board_rec.settings_override->'integrations'->slug_val;
      runtime_enabled := COALESCE((runtime_config->>'enabled')::boolean, false);
      raw_config := COALESCE(runtime_config->'config', '{}'::jsonb);

      -- Check if there are any actual credential values
      has_any_value := false;
      FOR cred_key, cred_val IN SELECT * FROM jsonb_each_text(raw_config)
      LOOP
        IF cred_val IS NOT NULL AND LENGTH(cred_val) > 0 THEN
          has_any_value := true;
          EXIT;
        END IF;
      END LOOP;

      -- Check if connection already exists for this account + definition
      SELECT id INTO existing_conn_id
      FROM public.integration_connections
      WHERE account_id = board_rec.account_id AND definition_id = new_def_id;

      IF existing_conn_id IS NULL AND has_any_value THEN
        -- Create connection with credentials stored as-is
        -- (the existing config values are already individually encrypted for password fields,
        --  but the new system expects a single encrypted blob. Since we can't re-encrypt
        --  in pure SQL, we store the raw config as a JSON text marker for the backend
        --  to process on first access. The backend will handle re-encryption.)
        INSERT INTO public.integration_connections (
          account_id,
          definition_id,
          credentials, -- Store raw config JSON as text; backend will re-encrypt on first use
          status,
          config
        ) VALUES (
          board_rec.account_id,
          new_def_id,
          raw_config::text, -- Temporary: raw JSON text, not yet AES encrypted
          CASE WHEN runtime_enabled THEN 'active' ELSE 'pending' END,
          '{}'::jsonb
        )
        RETURNING id INTO new_conn_id;
      ELSIF existing_conn_id IS NOT NULL THEN
        new_conn_id := existing_conn_id;
      END IF;

      -- Create board_integration_ref if we have a connection
      IF new_conn_id IS NOT NULL THEN
        INSERT INTO public.board_integration_refs (board_id, connection_id, is_required)
        VALUES (board_rec.id, new_conn_id, required_val)
        ON CONFLICT (board_id, connection_id) DO NOTHING;
      END IF;

      -- Reset for next iteration
      new_conn_id := NULL;
      existing_conn_id := NULL;
    END LOOP;
  END LOOP;
END $$;
