'use server'

import { getAuthToken, isTokenExpired } from '@/lib/auth'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type {
    IntegrationDefinition,
    IntegrationConnection,
    BoardIntegrationRef,
    CreateDefinitionPayload,
    UpdateDefinitionPayload,
    CreateConnectionPayload,
    UpdateConnectionPayload,
    IntegrationCatalogItem,
} from '@/types/integration'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'

async function getAuthHeaders() {
    const token = await getAuthToken()
    if (!token || isTokenExpired(token)) return null
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    }
}

async function getCurrentAccountId() {
    const cookieStore = await cookies()
    return cookieStore.get('current_account_id')?.value
}

// ============================================================================
// Integration Definitions
// ============================================================================

export async function getDefinitions(): Promise<IntegrationDefinition[]> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/definitions`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function createDefinition(
    data: CreateDefinitionPayload
): Promise<{ data?: IntegrationDefinition; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/definitions`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
            }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to create definition' }))
            return { error: err.message || 'Failed to create definition' }
        }
        revalidatePath('/dashboard/settings/integrations')
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function updateDefinition(
    defId: string,
    data: UpdateDefinitionPayload
): Promise<{ data?: IntegrationDefinition; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/definitions/${defId}`,
            {
                method: 'PATCH',
                headers,
                body: JSON.stringify(data),
            }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to update definition' }))
            return { error: err.message || 'Failed to update definition' }
        }
        revalidatePath('/dashboard/settings/integrations')
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function deleteDefinition(
    defId: string
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/definitions/${defId}`,
            { method: 'DELETE', headers }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to delete definition' }))
            return { error: err.message || 'Failed to delete definition' }
        }
        revalidatePath('/dashboard/settings/integrations')
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

// ============================================================================
// Integration Connections
// ============================================================================

export async function getConnections(): Promise<IntegrationConnection[]> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/connections`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function createConnection(
    data: CreateConnectionPayload
): Promise<{ data?: IntegrationConnection; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/connections`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
            }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to create connection' }))
            return { error: err.message || 'Failed to create connection' }
        }
        revalidatePath('/dashboard/settings/integrations')
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function updateConnection(
    connId: string,
    data: UpdateConnectionPayload
): Promise<{ data?: IntegrationConnection; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/connections/${connId}`,
            {
                method: 'PATCH',
                headers,
                body: JSON.stringify(data),
            }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to update connection' }))
            return { error: err.message || 'Failed to update connection' }
        }
        revalidatePath('/dashboard/settings/integrations')
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function deleteConnection(
    connId: string
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/connections/${connId}`,
            { method: 'DELETE', headers }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to delete connection' }))
            return { error: err.message || 'Failed to delete connection' }
        }
        revalidatePath('/dashboard/settings/integrations')
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function testConnection(
    connId: string
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/connections/${connId}/test`,
            { method: 'POST', headers }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Test failed' }))
            return { error: err.message || 'Test failed' }
        }
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

// ============================================================================
// OAuth
// ============================================================================

export async function initiateOAuth(
    defId: string
): Promise<{ redirect_url?: string; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/oauth/${defId}/authorize`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to initiate OAuth' }))
            return { error: err.message || 'Failed to initiate OAuth' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

// ============================================================================
// Board Integration Refs
// ============================================================================

export async function getBoardIntegrationRefs(
    boardId: string
): Promise<BoardIntegrationRef[]> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/boards/${boardId}/integration-refs`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function addBoardIntegrationRef(
    boardId: string,
    connectionId: string,
    isRequired?: boolean
): Promise<{ data?: BoardIntegrationRef; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/boards/${boardId}/integration-refs`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    connection_id: connectionId,
                    is_required: isRequired ?? false,
                }),
            }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to add integration to board' }))
            return { error: err.message || 'Failed to add integration to board' }
        }
        revalidatePath(`/dashboard/boards/${boardId}`)
        revalidatePath(`/dashboard/boards/${boardId}/settings`)
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function removeBoardIntegrationRef(
    boardId: string,
    refId: string
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/boards/${boardId}/integration-refs/${refId}`,
            { method: 'DELETE', headers }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to remove integration from board' }))
            return { error: err.message || 'Failed to remove integration from board' }
        }
        revalidatePath(`/dashboard/boards/${boardId}`)
        revalidatePath(`/dashboard/boards/${boardId}/settings`)
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

// ============================================================================
// Catalog (definitions + connections merged)
// ============================================================================

export async function getIntegrationCatalog(): Promise<IntegrationCatalogItem[]> {
    const [definitions, connections] = await Promise.all([
        getDefinitions(),
        getConnections(),
    ])

    return definitions.map((def) => ({
        definition: def,
        connection: connections.find((c) => c.definition_id === def.id) ?? null,
    }))
}

// ============================================================================
// Toggle, Health Check & Category Filters
// ============================================================================

export async function toggleConnection(connId: string, enabled: boolean) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }
    const accountId = await getCurrentAccountId()
    if (!accountId) return { error: 'No account' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/connections/${connId}/toggle`,
            {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
            }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: err.message || 'Failed to toggle connection' }
        }
        return { data: await res.json() }
    } catch (err: any) {
        return { error: err.message || 'Failed to toggle connection' }
    }
}

export async function checkConnectionHealth(connId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }
    const accountId = await getCurrentAccountId()
    if (!accountId) return { error: 'No account' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/connections/${connId}/health-check`,
            {
                method: 'POST',
                headers,
            }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: err.message || 'Health check failed' }
        }
        return { data: await res.json() }
    } catch (err: any) {
        return { error: err.message || 'Health check failed' }
    }
}

export async function getConnectionsByCategory(category: string) {
    const headers = await getAuthHeaders()
    if (!headers) return []
    const accountId = await getCurrentAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/connections?category=${encodeURIComponent(category)}`,
            { headers }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function getDefinitionsByCategory(category: string) {
    const headers = await getAuthHeaders()
    if (!headers) return []
    const accountId = await getCurrentAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/integrations/definitions?category=${encodeURIComponent(category)}`,
            { headers }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}
