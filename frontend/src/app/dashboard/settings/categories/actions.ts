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
// Categories CRUD
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

export async function createCategory(data: {
    name: string
    color?: string
    icon?: string
    visible?: boolean
}) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/categories`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create category' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function updateCategory(
    categoryId: string,
    data: { name?: string; color?: string; icon?: string; visible?: boolean },
) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/categories/${categoryId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to update category' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

export async function deleteCategory(categoryId: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/categories/${categoryId}`, {
            method: 'DELETE',
            headers,
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to delete category' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

// ============================================================================
// Sources (for listing linked sources per category)
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

// ============================================================================
// Source property fetching (for filter builder)
// Uses stored credentials — no raw API keys needed on the frontend
// ============================================================================

export async function getSourceProperties(sourceId: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/sources/${sourceId}/properties`,
            { headers, cache: 'no-store' },
        )
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}
