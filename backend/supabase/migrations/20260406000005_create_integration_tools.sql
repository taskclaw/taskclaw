-- M05: Create integration_tools table
CREATE TABLE IF NOT EXISTS integration_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid REFERENCES integration_definitions(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  display_name varchar(200) NOT NULL,
  description text NOT NULL,
  http_method varchar(10) NOT NULL DEFAULT 'POST',
  endpoint_template varchar(500) NOT NULL,
  auth_header_name varchar(100),
  auth_credential_key varchar(100),
  request_body_schema jsonb,
  response_schema jsonb,
  response_extract varchar(200),
  is_streaming boolean DEFAULT false,
  timeout_seconds integer DEFAULT 300,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_tools_def ON integration_tools(definition_id);
CREATE INDEX IF NOT EXISTS idx_integration_tools_account ON integration_tools(account_id);
ALTER TABLE integration_tools ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users see integration tools" ON integration_tools FOR SELECT USING (account_id IN (SELECT get_auth_user_account_ids()) OR account_id IS NULL); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
