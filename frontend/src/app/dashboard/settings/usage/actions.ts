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

export async function getUsageSummary(days: number = 30) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return null

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/usage?days=${days}`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

export async function getUsageBreakdown(days: number = 30) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return null

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/usage/breakdown?days=${days}`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

export async function getTaskUsage(taskId: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return null

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/usage/task/${taskId}`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}
