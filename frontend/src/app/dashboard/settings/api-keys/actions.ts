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
// API Keys CRUD
// ============================================================================

export async function getApiKeys() {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/api-keys`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function createApiKey(data: {
    name: string
    scopes?: string[]
    expires_at?: string | null
}) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/api-keys`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create API key' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function deleteApiKey(keyId: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/api-keys/${keyId}`, {
            method: 'DELETE',
            headers,
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to delete API key' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}
