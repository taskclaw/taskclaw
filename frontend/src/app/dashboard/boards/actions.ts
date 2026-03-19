'use server'

import { revalidatePath } from 'next/cache'
import { getAuthToken, isTokenExpired } from '@/lib/auth'
import { cookies } from 'next/headers'
import type { Board, BoardStep, BoardTemplate, IntegrationStatus } from '@/types/board'

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

// ─── Board Instances ──────────────────────────────────────────────────

export async function getBoards(filters?: {
    archived?: string
    favorite?: string
}): Promise<Board[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const params = new URLSearchParams()
        if (filters?.archived) params.set('archived', filters.archived)
        if (filters?.favorite) params.set('favorite', filters.favorite)

        const queryString = params.toString()
        const url = `${API_URL}/accounts/${accountId}/boards${queryString ? `?${queryString}` : ''}`

        const res = await fetch(url, { headers, cache: 'no-store' })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function getBoard(boardId: string): Promise<Board | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null

    const accountId = await getActiveAccountId()
    if (!accountId) return null

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

export async function createBoard(data: {
    name: string
    description?: string
    icon?: string
    color?: string
    tags?: string[]
    is_favorite?: boolean
    default_category_id?: string
    steps?: { step_key: string; name: string; step_type?: string; color?: string }[]
}): Promise<{ success?: boolean; board?: Board; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create board' }
        }

        const board = await res.json()
        revalidatePath('/dashboard/boards')
        revalidatePath('/dashboard')
        return { success: true, board }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updateBoard(
    boardId: string,
    updates: Partial<{
        name: string
        description: string
        icon: string
        color: string
        tags: string[]
        is_favorite: boolean
        display_order: number
        is_archived: boolean
        default_category_id: string | null
        settings_override: Record<string, any>
    }>
): Promise<{ success?: boolean; board?: Board; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(updates),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to update board' }
        }

        const board = await res.json()
        revalidatePath('/dashboard/boards')
        revalidatePath('/dashboard')
        return { success: true, board }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function deleteBoard(boardId: string): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}`, {
            method: 'DELETE',
            headers,
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to delete board' }
        }

        revalidatePath('/dashboard/boards')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function duplicateBoard(boardId: string): Promise<{ success?: boolean; board?: Board; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}/duplicate`, {
            method: 'POST',
            headers,
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to duplicate board' }
        }

        const board = await res.json()
        revalidatePath('/dashboard/boards')
        revalidatePath('/dashboard')
        return { success: true, board }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function exportBoard(boardId: string): Promise<any | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null

    const accountId = await getActiveAccountId()
    if (!accountId) return null

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}/export`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

// ─── Board Steps ──────────────────────────────────────────────────────

export async function getBoardSteps(boardId: string): Promise<BoardStep[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}/steps`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function createBoardStep(
    boardId: string,
    data: { step_key: string; name: string; step_type?: string; position?: number; color?: string; linked_category_id?: string | null }
): Promise<{ success?: boolean; step?: BoardStep; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}/steps`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create step' }
        }

        const step = await res.json()
        revalidatePath(`/dashboard/boards/${boardId}`)
        return { success: true, step }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updateBoardStep(
    boardId: string,
    stepId: string,
    updates: Partial<{
        name: string
        position: number
        color: string
        step_type: string
        linked_category_id: string | null
        trigger_type: string
        ai_first: boolean
        input_schema: any[]
        output_schema: any[]
        on_success_step_id: string | null
        on_error_step_id: string | null
        webhook_url: string | null
        webhook_auth_header: string | null
        schedule_cron: string | null
        system_prompt: string | null
    }>
): Promise<{ success?: boolean; step?: BoardStep; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}/steps/${stepId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(updates),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to update step' }
        }

        const step = await res.json()
        revalidatePath(`/dashboard/boards/${boardId}`)
        return { success: true, step }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function deleteBoardStep(
    boardId: string,
    stepId: string
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}/steps/${stepId}`, {
            method: 'DELETE',
            headers,
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to delete step' }
        }

        revalidatePath(`/dashboard/boards/${boardId}`)
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function reorderSteps(
    boardId: string,
    stepIds: string[]
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}/steps/reorder`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ step_ids: stepIds }),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to reorder steps' }
        }

        revalidatePath(`/dashboard/boards/${boardId}`)
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

// ─── Board Templates ──────────────────────────────────────────────────

export async function getTemplates(): Promise<BoardTemplate[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    try {
        const res = await fetch(`${API_URL}/board-templates`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function installTemplate(data: {
    template_id: string
    name?: string
}): Promise<{ success?: boolean; board?: Board; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/install`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to install template' }
        }

        const board = await res.json()
        revalidatePath('/dashboard/boards')
        revalidatePath('/dashboard')
        return { success: true, board }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function importManifest(manifest: any): Promise<{ success?: boolean; board?: Board; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/import`, {
            method: 'POST',
            headers,
            body: JSON.stringify(manifest),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to import board' }
        }

        const board = await res.json()
        revalidatePath('/dashboard/boards')
        revalidatePath('/dashboard')
        return { success: true, board }
    } catch (error: any) {
        return { error: error.message }
    }
}

// ─── Board Integrations ──────────────────────────────────────────────

export async function getBoardIntegrations(boardId: string): Promise<IntegrationStatus[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/boards/${boardId}/integrations`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function updateBoardIntegration(
    boardId: string,
    slug: string,
    data: { enabled: boolean; config: Record<string, string> }
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/boards/${boardId}/integrations/${slug}`,
            {
                method: 'PATCH',
                headers,
                body: JSON.stringify(data),
            }
        )

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to update integration' }
        }

        revalidatePath(`/dashboard/boards/${boardId}`)
        revalidatePath(`/dashboard/boards/${boardId}/settings`)
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

// ─── Board Tasks (extends existing tasks actions) ─────────────────────

export async function getBoardTasks(boardId: string): Promise<any[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/tasks?board_id=${boardId}&completed=false`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

/**
 * Bulk-create tasks on a board (used by Board AI Chat after user confirms).
 */
export async function bulkCreateBoardTasks(
    boardId: string,
    tasks: Array<{ title: string; priority?: string; notes?: string; card_data?: Record<string, any> }>,
): Promise<{ data?: any[]; error?: string }> {
    const headers = await getAuthHeaders()
    const accountId = await getActiveAccountId()

    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/tasks/bulk/${boardId}`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ tasks }),
            }
        )

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'Unknown error' }))
            return { error: errorData.message || 'Failed to create tasks' }
        }

        return { data: await res.json() }
    } catch (error: any) {
        return { error: error.message || 'Network error' }
    }
}
