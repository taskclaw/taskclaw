'use server'

import { getAuthToken, isTokenExpired } from '@/lib/auth'
import { cookies } from 'next/headers'
import type { AgentDashboardItem } from '@/types/board'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

async function getAuthHeaders() {
    const token = await getAuthToken()
    if (!token || isTokenExpired(token)) return null
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    }
}

async function getActiveAccountId(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get('current_account_id')?.value || null
}

export async function getAgentsDashboard(): Promise<AgentDashboardItem[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/skills/agents/dashboard`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}
