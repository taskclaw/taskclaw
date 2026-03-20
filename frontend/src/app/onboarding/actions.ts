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
// Create Category
// ============================================================================

export async function createCategory(data: { name: string; color: string }) {
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

// ============================================================================
// Create Source (simplified for onboarding)
// ============================================================================

export async function createSource(data: {
    provider: string
    category_id: string
    config: Record<string, any>
    sync_interval_minutes?: number
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

// ============================================================================
// Get Default Categories (public, no auth)
// ============================================================================

export async function getDefaultCategories(): Promise<
    Array<{ name: string; color: string; icon: string }> | null
> {
    try {
        const res = await fetch(`${API_URL}/system-settings/default-categories`, {
            cache: 'no-store',
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

// ============================================================================
// Bulk Create Categories (for onboarding)
// ============================================================================

export async function createBulkCategories(
    categories: Array<{ name: string; color: string; icon?: string }>
) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/categories/bulk`, {
            method: 'POST',
            headers,
            body: JSON.stringify(categories),
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create categories' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

// ============================================================================
// Complete Onboarding
// ============================================================================

export async function completeOnboarding() {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    // Always set the cookie first so the user is never stuck in the onboarding loop
    const cookieStore = await cookies()
    cookieStore.set('onboarding_completed', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
    })

    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ onboarding_completed: true }),
        })
        if (!res.ok) {
            // Cookie is already set — user won't be stuck
            return { success: true }
        }

        return await res.json()
    } catch {
        // Cookie is already set — user won't be stuck
        return { success: true }
    }
}
