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

export async function getAdminUsers(page: number = 1, limit: number = 10, search: string = '', status?: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const url = new URL(`${API_URL}/admin/users`)
        url.searchParams.append('page', page.toString())
        url.searchParams.append('limit', limit.toString())
        if (search) url.searchParams.append('search', search)
        if (status) url.searchParams.append('status', status)

        const res = await fetch(url.toString(), { headers })
        if (!res.ok) return { error: await res.text() }
        return await res.json()
    } catch (error) {
        return { error: 'Failed to fetch users' }
    }
}

export async function getAdminUserDetails(userId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return null

    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}`, {
            headers,
        })
        if (!res.ok) return null
        return await res.json()
    } catch (error) {
        return null
    }
}

export async function updateUserRole(userId: string, role: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}/role`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ role }),
        })
        if (!res.ok) return { error: await res.text() }
        return { success: true }
    } catch (error) {
        return { error: 'Failed to update role' }
    }
}

export async function approveUser(userId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}/status`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ status: 'active' }),
        })
        if (!res.ok) return { error: await res.text() }
        return { success: true }
    } catch (error) {
        return { error: 'Failed to approve user' }
    }
}

export async function deleteUser(userId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}`, {
            method: 'DELETE',
            headers,
        })
        if (!res.ok) return { error: await res.text() }
        return { success: true }
    } catch (error) {
        return { error: 'Failed to delete user' }
    }
}

export async function searchAdminItems(query: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { users: [], accounts: [], projects: [] }

    try {
        const res = await fetch(`${API_URL}/admin/search?q=${query}`, {
            headers,
        })
        if (!res.ok) return { users: [], accounts: [], projects: [] }
        return await res.json()
    } catch (error) {
        return { users: [], accounts: [], projects: [] }
    }
}
