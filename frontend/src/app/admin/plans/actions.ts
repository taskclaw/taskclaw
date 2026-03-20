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

export async function getAdminPlans() {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/plans`, {
            headers,
        })
        if (!res.ok) return { error: await res.text() }
        return await res.json()
    } catch (error) {
        return { error: 'Failed to fetch plans' }
    }
}

export async function createPlan(data: any) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/plans`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) return { error: await res.text() }
        return await res.json()
    } catch (error) {
        return { error: 'Failed to create plan' }
    }
}

export async function updatePlan(id: string, data: any) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/plans/${id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) return { error: await res.text() }
        return await res.json()
    } catch (error) {
        return { error: 'Failed to update plan' }
    }
}

export async function deletePlan(id: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/plans/${id}`, {
            method: 'DELETE',
            headers,
        })
        if (!res.ok) return { error: await res.text() }
        return { success: true }
    } catch (error) {
        return { error: 'Failed to delete plan' }
    }
}
