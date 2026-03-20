'use server'

import { getAuthToken, isTokenExpired } from '@/lib/auth'
import { cookies } from 'next/headers'

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
// Sources CRUD
// ============================================================================

export async function getSources() {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/sources`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function createSource(data: {
    provider: string
    category_id: string
    config: Record<string, any>
    sync_interval_minutes?: number
    connection_id?: string
}) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/sources`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create source' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function updateSource(sourceId: string, data: Record<string, any>) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/sources/${sourceId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to update source' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function deleteSource(sourceId: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/sources/${sourceId}`, {
            method: 'DELETE',
            headers,
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to delete source' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function validateSource(provider: string, config: Record<string, any>) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { valid: false, error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/sources/validate`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ provider, config }),
        })
        return await res.json()
    } catch (e: any) {
        return { valid: false, error: e.message || 'Network error' }
    }
}

export async function triggerSync(sourceId: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/sync/sources/${sourceId}`, {
            method: 'POST',
            headers,
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to trigger sync' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function getSyncStatus() {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/sync/status`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

// ============================================================================
// Provider-specific discovery
// ============================================================================

export async function listNotionDatabases(apiKey: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/sources/notion/databases`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ api_key: apiKey }),
        })
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function listClickUpWorkspaces(apiToken: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/sources/clickup/workspaces`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ api_token: apiToken }),
        })
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

// ============================================================================
// Categories (needed for source wizard)
// ============================================================================

export async function getCategories() {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/categories`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}
