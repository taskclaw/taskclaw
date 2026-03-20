'use server'

import { getAuthToken } from "@/lib/auth"

export async function getSystemSettings() {
    const token = await getAuthToken()
    if (!token) return null

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}/system-settings`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
    })

    if (!res.ok) {
        return null
    }

    return res.json()
}

export async function updateSystemSettings(settings: {
    allow_multiple_projects?: boolean
    allow_multiple_teams?: boolean
    theme_set?: string
    extended_settings?: Record<string, unknown>
}) {
    const token = await getAuthToken()
    if (!token) return { error: 'Unauthorized' }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}/system-settings`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
    })

    if (!res.ok) {
        const error = await res.json()
        return { error: error.message || 'Failed to update settings' }
    }

    return { success: true }
}
