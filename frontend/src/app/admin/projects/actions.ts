'use server'

import { serverApiBase } from '@/lib/api-base'
import { getAuthToken } from '@/lib/auth'

const API_URL = serverApiBase()

async function getAuthHeaders() {
    const token = await getAuthToken()
    if (!token) return null
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    }
}

export async function getAdminProjects(page: number = 1, limit: number = 10, search: string = '') {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/admin/projects?page=${page}&limit=${limit}&search=${search}`, {
            headers,
        })
        if (!res.ok) return { error: await res.text() }
        return await res.json()
    } catch (error) {
        return { error: 'Failed to fetch projects' }
    }
}
