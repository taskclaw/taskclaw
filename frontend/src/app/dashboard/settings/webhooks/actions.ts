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
// Webhooks CRUD
// ============================================================================

export async function getWebhooks() {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/webhooks`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function createWebhook(data: {
    url: string
    secret?: string
    events: string[]
    active?: boolean
}) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/webhooks`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create webhook' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function updateWebhook(
    webhookId: string,
    data: {
        url?: string
        secret?: string
        events?: string[]
        active?: boolean
    }
) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/webhooks/${webhookId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to update webhook' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function deleteWebhook(webhookId: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/webhooks/${webhookId}`, {
            method: 'DELETE',
            headers,
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to delete webhook' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function getDeliveries(webhookId: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/webhooks/${webhookId}/deliveries`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}
