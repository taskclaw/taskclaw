// ============================================================================
// Integration Definition — reusable template for a service
// ============================================================================

export type IntegrationAuthType = 'api_key' | 'oauth2' | 'webhook' | 'basic' | 'none'

export interface IntegrationAuthKeyField {
    key: string
    label: string
    type: 'text' | 'password' | 'url' | 'number'
    required: boolean
    placeholder?: string
    help_text?: string
}

export interface IntegrationAuthConfigApiKey {
    key_fields: IntegrationAuthKeyField[]
}

export interface IntegrationAuthConfigOAuth2 {
    authorization_url: string
    token_url: string
    default_scopes?: string[]
    scope_separator?: string
    pkce?: boolean
    client_id?: string
    client_secret?: string
}

export interface IntegrationAuthConfigWebhook {
    webhook_fields?: IntegrationAuthKeyField[]
}

export type IntegrationAuthConfig =
    | IntegrationAuthConfigApiKey
    | IntegrationAuthConfigOAuth2
    | IntegrationAuthConfigWebhook
    | Record<string, any>

export interface IntegrationConfigField {
    key: string
    label: string
    type: 'text' | 'password' | 'url' | 'number' | 'boolean'
    required: boolean
    placeholder?: string
    help_text?: string
}

export interface IntegrationDefinition {
    id: string
    account_id: string
    slug: string
    name: string
    description: string | null
    icon: string
    categories: string[]
    auth_type: IntegrationAuthType
    auth_config: IntegrationAuthConfig
    config_fields: IntegrationConfigField[]
    skill_id: string | null
    setup_guide: string | null
    is_system: boolean
    proxy_base_url: string | null
    created_at: string
    updated_at: string
}

// ============================================================================
// Integration Connection — per-account instance with credentials
// ============================================================================

export type IntegrationConnectionStatus = 'pending' | 'active' | 'expired' | 'error' | 'revoked'

export interface IntegrationConnection {
    id: string
    account_id: string
    definition_id: string
    definition?: IntegrationDefinition
    credentials_masked?: Record<string, string>
    token_expires_at: string | null
    scopes: string[]
    status: IntegrationConnectionStatus
    verified_at: string | null
    last_used_at: string | null
    error_message: string | null
    config: Record<string, any>
    external_account_name: string | null
    test_conversation_id: string | null
    created_at: string
    updated_at: string
}

// ============================================================================
// Board Integration Ref — links a board to a connection
// ============================================================================

export interface BoardIntegrationRef {
    id: string
    board_id: string
    connection_id: string
    connection?: IntegrationConnection
    is_required: boolean
    created_at: string
}

// ============================================================================
// API Payloads
// ============================================================================

export interface CreateDefinitionPayload {
    slug: string
    name: string
    description?: string
    icon?: string
    categories?: string[]
    auth_type: IntegrationAuthType
    auth_config?: IntegrationAuthConfig
    config_fields?: IntegrationConfigField[]
    skill_id?: string
    setup_guide?: string
}

export interface UpdateDefinitionPayload {
    name?: string
    description?: string
    icon?: string
    categories?: string[]
    auth_config?: IntegrationAuthConfig
    config_fields?: IntegrationConfigField[]
    skill_id?: string
    setup_guide?: string
}

export interface CreateConnectionPayload {
    definition_id: string
    credentials?: Record<string, string>
    config?: Record<string, any>
    external_account_name?: string
}

export interface UpdateConnectionPayload {
    credentials?: Record<string, string>
    config?: Record<string, any>
    external_account_name?: string
    status?: IntegrationConnectionStatus
}

// ============================================================================
// Catalog Item — definition + optional connection status for display
// ============================================================================

export interface IntegrationCatalogItem {
    definition: IntegrationDefinition
    connection: IntegrationConnection | null
}
