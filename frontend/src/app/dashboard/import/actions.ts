'use server'

import { revalidatePath } from 'next/cache'
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

async function getActiveAccountId(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get('current_account_id')?.value || null
}

export interface BundleImportResult {
    success?: boolean
    categories_created?: number
    categories_reused?: number
    skills_created?: number
    knowledge_docs_created?: number
    boards_created?: number
    errors?: string[]
    error?: string
}

export async function importBundle(bundle: any): Promise<BundleImportResult> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/bundle-import`, {
            method: 'POST',
            headers,
            body: JSON.stringify(bundle),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to import bundle' }
        }

        const result = await res.json()
        revalidatePath('/dashboard/boards')
        revalidatePath('/dashboard/settings/categories')
        revalidatePath('/dashboard/settings/skills')
        revalidatePath('/dashboard/knowledge')
        revalidatePath('/dashboard')
        return { success: true, ...result }
    } catch (error: any) {
        return { error: error.message }
    }
}
