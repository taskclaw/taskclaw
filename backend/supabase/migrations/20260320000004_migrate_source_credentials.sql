-- ═══════════════════════════════════════════════════════════
-- Integration Unification: Migrate source credentials → integration_connections
-- ═══════════════════════════════════════════════════════════
-- Migrates existing sources that store credentials in their config JSONB
-- into integration_connections, and links the source row via connection_id.
-- Credentials are stored as plain JSON text — the backend will encrypt
-- them on first read using AES-256-GCM.

DO $$
DECLARE
  src_rec RECORD;
  def_id UUID;
  def_slug TEXT;
  existing_conn_id UUID;
  new_conn_id UUID;
  cred_json JSONB;
  config_json JSONB;
BEGIN
  FOR src_rec IN
    SELECT * FROM public.sources WHERE connection_id IS NULL
  LOOP
    -- Map provider to definition slug
    def_slug := src_rec.provider || '-source';

    SELECT id INTO def_id
    FROM public.integration_definitions
    WHERE slug = def_slug AND is_system = true
    LIMIT 1;

    IF def_id IS NULL THEN CONTINUE; END IF;

    -- Check if connection already exists for this account+definition
    SELECT id INTO existing_conn_id
    FROM public.integration_connections
    WHERE account_id = src_rec.account_id AND definition_id = def_id;

    IF existing_conn_id IS NOT NULL THEN
      -- Link existing connection
      UPDATE public.sources SET connection_id = existing_conn_id WHERE id = src_rec.id;
      CONTINUE;
    END IF;

    -- Extract credential keys from config
    cred_json := '{}';
    config_json := COALESCE(src_rec.config, '{}');

    IF src_rec.provider = 'notion' THEN
      IF config_json ? 'api_key' THEN
        cred_json := jsonb_build_object('api_key', config_json->>'api_key');
      END IF;
    ELSIF src_rec.provider = 'clickup' THEN
      IF config_json ? 'api_token' THEN
        cred_json := jsonb_build_object('api_token', config_json->>'api_token');
      END IF;
    END IF;

    -- Create connection with credentials as plain JSON text (to be encrypted by backend)
    INSERT INTO public.integration_connections (
      account_id, definition_id, credentials, status, config
    ) VALUES (
      src_rec.account_id,
      def_id,
      cred_json::text,  -- plain JSON, backend will encrypt on first read
      'active',
      config_json - 'api_key' - 'api_token'  -- non-sensitive config only
    )
    RETURNING id INTO new_conn_id;

    -- Link source to new connection
    UPDATE public.sources SET connection_id = new_conn_id WHERE id = src_rec.id;
  END LOOP;
END $$;
