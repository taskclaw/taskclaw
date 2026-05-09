'use server'

import { getAuthToken, isTokenExpired } from '@/lib/auth'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

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
// Memory Connections
// ============================================================================

export interface MemoryConnection {
    id: string
    account_id: string
    adapter_slug: string
    name: string
    config: Record<string, unknown>
    is_active: boolean
    is_account_default: boolean
    created_at: string
    updated_at: string
}

export async function getMemoryConnections(): Promise<MemoryConnection[]> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/memory/connections`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function createMemoryConnection(
    data: Partial<MemoryConnection>
): Promise<{ data?: MemoryConnection; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/memory/connections`,
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
        revalidatePath('/dashboard/settings/memory')
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function updateMemoryConnection(
    connectionId: string,
    data: Partial<MemoryConnection>
): Promise<{ data?: MemoryConnection; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/memory/connections/${connectionId}`,
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
        revalidatePath('/dashboard/settings/memory')
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function deleteMemoryConnection(
    connectionId: string
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/memory/connections/${connectionId}`,
            { method: 'DELETE', headers }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to delete connection' }))
            return { error: err.message || 'Failed to delete' }
        }
        revalidatePath('/dashboard/settings/memory')
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function checkMemoryHealth(
    connectionId: string
): Promise<{ healthy: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { healthy: false, error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/memory/connections/${connectionId}/health`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return { healthy: false, error: 'Health check failed' }
        const data = await res.json()
        return { healthy: data.healthy === true }
    } catch (e: any) {
        return { healthy: false, error: e.message || 'Network error' }
    }
}

// ============================================================================
// Memory Entries
// ============================================================================

export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'working'
export type MemorySource = 'agent' | 'human' | 'sync'

export interface MemoryEntry {
    id: string
    account_id: string
    content: string
    type: MemoryType
    source: MemorySource
    salience: number
    task_id?: string | null
    conversation_id?: string | null
    created_at: string
    updated_at: string
}

export async function getMemoryEntries(options?: {
    type?: MemoryType
    limit?: number
    task_id?: string
}): Promise<MemoryEntry[]> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const params = new URLSearchParams()
        if (options?.type) params.set('type', options.type)
        if (options?.limit) params.set('limit', String(options.limit))
        if (options?.task_id) params.set('task_id', options.task_id)

        const res = await fetch(
            `${API_URL}/accounts/${accountId}/memory/entries?${params.toString()}`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function deleteMemoryEntry(
    memoryId: string
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/memory/entries/${memoryId}`,
            { method: 'DELETE', headers }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to delete memory' }))
            return { error: err.message || 'Failed to delete' }
        }
        revalidatePath('/dashboard/settings/memory/entries')
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}
