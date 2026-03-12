'use server'

import { getAuthToken, isTokenExpired } from '@/lib/auth'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

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
// Types
// ============================================================================

export interface CommToolStatus {
    tool_type: 'telegram' | 'whatsapp' | 'slack'
    is_enabled: boolean
    health_status: 'healthy' | 'unhealthy' | 'checking' | 'unknown'
    last_checked_at: string | null
    last_healthy_at: string | null
    last_error: string | null
    check_interval_minutes: number
    config: Record<string, any>
}

// ============================================================================
// Server Actions
// ============================================================================

export async function getCommToolStatuses(): Promise<CommToolStatus[]> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/comm-tools`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) return []
        return await res.json()
    } catch (error) {
        console.error('Failed to load comm tool statuses:', error)
        return []
    }
}

export async function toggleCommTool(
    toolType: string,
    isEnabled: boolean,
): Promise<{ data?: CommToolStatus; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/comm-tools/toggle`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ tool_type: toolType, is_enabled: isEnabled }),
        })

        if (!res.ok) {
            const errorData = await res.json().catch(() => null)
            return { error: errorData?.message || `Failed to toggle ${toolType}` }
        }

        const data = await res.json()
        return { data }
    } catch (error: any) {
        return { error: error.message || `Failed to toggle ${toolType}` }
    }
}

export async function updateCommToolConfig(
    toolType: string,
    data: { check_interval_minutes?: number; config?: Record<string, any> },
): Promise<{ data?: CommToolStatus; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/comm-tools/${toolType}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(data),
        })

        if (!res.ok) {
            const errorData = await res.json().catch(() => null)
            return { error: errorData?.message || 'Failed to update config' }
        }

        const result = await res.json()
        return { data: result }
    } catch (error: any) {
        return { error: error.message || 'Failed to update config' }
    }
}

export async function checkCommToolNow(
    toolType: string,
): Promise<{ data?: CommToolStatus; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/comm-tools/${toolType}/check`, {
            method: 'POST',
            headers,
        })

        if (!res.ok) {
            const errorData = await res.json().catch(() => null)
            return { error: errorData?.message || 'Health check failed' }
        }

        const data = await res.json()
        return { data }
    } catch (error: any) {
        return { error: error.message || 'Health check failed' }
    }
}
