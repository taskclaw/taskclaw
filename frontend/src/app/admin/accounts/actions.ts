'use server'

import { getAuthToken } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'

async function getAuthHeaders() {
    const token = await getAuthToken()
    if (!token) return null
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    }
}

export async function getAdminAccounts(page: number = 1, limit: number = 10, search: string = '') {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/admin/accounts?page=${page}&limit=${limit}&search=${search}`, {
            headers,
        })
        if (!res.ok) return { error: await res.text() }
        return await res.json()
    } catch (error) {
        return { error: 'Failed to fetch accounts' }
    }
}
