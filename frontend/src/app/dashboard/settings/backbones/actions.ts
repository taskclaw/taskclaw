'use server'

import { getAuthToken, isTokenExpired } from '@/lib/auth'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type {
    BackboneDefinition,
    BackboneConnection,
    CreateBackboneConnectionPayload,
    UpdateBackboneConnectionPayload,
} from '@/types/backbone'

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
// Backbone Definitions
// ============================================================================

export async function getBackboneDefinitions(): Promise<BackboneDefinition[]> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/backbone/definitions`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

// ============================================================================
// Backbone Connections
// ============================================================================

export async function getBackboneConnections(): Promise<BackboneConnection[]> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/backbone/connections`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function getBackboneConnection(
    connectionId: string
): Promise<{ data?: BackboneConnection; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/backbone/connections/${connectionId}`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to fetch connection' }))
            return { error: err.message || 'Failed to fetch connection' }
        }
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function createBackboneConnection(
    data: CreateBackboneConnectionPayload
): Promise<{ data?: BackboneConnection; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/backbone/connections`,
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
        revalidatePath('/dashboard/settings/backbones')
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function updateBackboneConnection(
    connectionId: string,
    data: UpdateBackboneConnectionPayload
): Promise<{ data?: BackboneConnection; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/backbone/connections/${connectionId}`,
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
        revalidatePath('/dashboard/settings/backbones')
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function deleteBackboneConnection(
    connectionId: string
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/backbone/connections/${connectionId}`,
            { method: 'DELETE', headers }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to delete connection' }))
            return { error: err.message || 'Failed to delete connection' }
        }
        revalidatePath('/dashboard/settings/backbones')
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function verifyBackboneConnection(
    connectionId: string
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/backbone/connections/${connectionId}/verify`,
            { method: 'POST', headers }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Verification failed' }))
            return { error: err.message || 'Verification failed' }
        }
        revalidatePath('/dashboard/settings/backbones')
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function setDefaultBackboneConnection(
    connectionId: string
): Promise<{ data?: BackboneConnection; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/backbone/connections/${connectionId}/default`,
            { method: 'POST', headers }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Failed to set default backbone' }))
            return { error: err.message || 'Failed to set default backbone' }
        }
        revalidatePath('/dashboard/settings/backbones')
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}
