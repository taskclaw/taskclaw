export type AuthType = 'api_key' | 'oauth2' | 'webhook' | 'basic' | 'none';
export type ConnectionStatus = 'pending' | 'active' | 'expired' | 'error' | 'revoked';

export interface ConfigField {
  key: string;
  label: string;
  type: string; // 'text' | 'password' | 'url' | 'number' | 'select'
  required: boolean;
  placeholder?: string;
  help_text?: string;
  options?: string[]; // for select type
}

export interface OAuthConfig {
  authorization_url: string;
  token_url: string;
  refresh_url?: string;
  default_scopes?: string[];
  scope_separator?: string;
  pkce?: boolean;
  client_id?: string;
  client_secret?: string;
}

export interface ApiKeyConfig {
  key_fields: ConfigField[];
}

export interface IntegrationDefinition {
  id: string;
  account_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  categories: string[];
  auth_type: AuthType;
  auth_config: OAuthConfig | ApiKeyConfig | Record<string, any>;
  config_fields: ConfigField[];
  skill_id: string | null;
  setup_guide: string | null;
  is_system: boolean;
  proxy_base_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationConnection {
  id: string;
  account_id: string;
  definition_id: string;
  credentials: string | null; // encrypted blob
  token_expires_at: string | null;
  scopes: string[] | null;
  status: ConnectionStatus;
  verified_at: string | null;
  last_used_at: string | null;
  error_message: string | null;
  config: Record<string, any>;
  external_account_name: string | null;
  test_conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardIntegrationRef {
  id: string;
  board_id: string;
  connection_id: string;
  is_required: boolean;
  created_at: string;
}

export interface IntegrationContext {
  name: string;
  slug: string;
  status: string;
  external_account_name?: string;
  skill_instructions?: string;
  credentials: Record<string, string>;
  config: Record<string, any>;
}
