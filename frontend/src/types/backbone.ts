// ============================================================================
// Backbone Definition — reusable template for an AI backbone provider
// ============================================================================

export type BackboneProtocol = 'websocket' | 'http' | 'mcp' | 'cli'

export type BackboneHealthStatus = 'healthy' | 'unhealthy' | 'checking' | 'unknown'

export interface BackboneConfigSchemaField {
    key: string
    label: string
    type: 'string' | 'number' | 'secret' | 'boolean'
    required: boolean
    placeholder?: string
    default?: any
}

/** Shape returned by GET /accounts/:id/backbone/definitions */
export interface BackboneDefinition {
    slug: string
    label: string
    description: string | null
    icon: string
    color: string
    protocol: BackboneProtocol
    configSchema: BackboneConfigSchemaField[]
    available: boolean
}

// ============================================================================
// Backbone Connection — per-account instance linked to a definition
// ============================================================================

export interface BackboneConnection {
    id: string
    account_id: string
    backbone_type: string   // slug of the adapter (e.g. 'openclaw', 'claude-code')
    name: string
    description: string | null
    config: Record<string, any>  // masked values for secrets
    is_active: boolean
    is_default: boolean
    health_status: BackboneHealthStatus
    health_checked_at: string | null
    verified_at: string | null
    total_requests: number
    total_tokens: number
    created_at: string
    updated_at: string
}

// ============================================================================
// API Payloads
// ============================================================================

export interface CreateBackboneConnectionPayload {
    backbone_type: string   // adapter slug (e.g. 'openclaw', 'claude-code')
    name: string
    description?: string
    config: Record<string, any>
    is_default?: boolean
}

export interface UpdateBackboneConnectionPayload {
    name?: string
    description?: string
    config?: Record<string, any>
    is_active?: boolean
    is_default?: boolean
}
