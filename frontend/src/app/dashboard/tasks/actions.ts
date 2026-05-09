'use server'

import { revalidatePath } from 'next/cache'
import { getAuthToken, isTokenExpired } from '@/lib/auth'
import { cookies } from 'next/headers'
import type { Task, Category } from '@/types/task'

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

// ─── Tasks ────────────────────────────────────────────────────────────

export async function getTasks(filters?: {
    category_id?: string
    status?: string
    priority?: string
    completed?: string
}): Promise<Task[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const params = new URLSearchParams()
        if (filters?.category_id) params.set('category_id', filters.category_id)
        if (filters?.status) params.set('status', filters.status)
        if (filters?.priority) params.set('priority', filters.priority)
        if (filters?.completed) params.set('completed', filters.completed)

        const queryString = params.toString()
        const url = `${API_URL}/accounts/${accountId}/tasks${queryString ? `?${queryString}` : ''}`

        const res = await fetch(url, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function getTask(taskId: string): Promise<Task | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null

    const accountId = await getActiveAccountId()
    if (!accountId) return null

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/tasks/${taskId}`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

export async function getTaskContent(taskId: string): Promise<string> {
    const headers = await getAuthHeaders()
    if (!headers) return ''

    const accountId = await getActiveAccountId()
    if (!accountId) return ''

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/tasks/${taskId}/content`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) return ''
        const text = await res.text()
        try {
            return JSON.parse(text)
        } catch {
            return text
        }
    } catch {
        return ''
    }
}

export interface TaskComment {
    id: string
    text: string
    created_at: string
    author: string
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/tasks/${taskId}/comments`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function createTask(data: {
    title: string
    category_id?: string
    priority?: string
    status?: string
    notes?: string
    board_instance_id?: string
    current_step_id?: string
    card_data?: Record<string, Record<string, any>>
}): Promise<{ success?: boolean; task?: Task; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/tasks`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create task' }
        }

        const task = await res.json()
        revalidatePath('/dashboard/tasks')
        return { success: true, task }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updateTask(
    taskId: string,
    updates: Partial<{
        title: string
        category_id: string
        priority: string
        status: string
        completed: boolean
        notes: string
        due_date: string
        time_spent: number
        current_step_id: string
        override_category_id: string | null
        card_data: Record<string, Record<string, any>>
    }>
): Promise<{ success?: boolean; task?: Task; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/tasks/${taskId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(updates),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to update task' }
        }

        const task = await res.json()
        revalidatePath('/dashboard/tasks')
        return { success: true, task }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function deleteTask(taskId: string): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/tasks/${taskId}`, {
            method: 'DELETE',
            headers,
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to delete task' }
        }

        revalidatePath('/dashboard/tasks')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function moveTask(
    taskId: string,
    status: string
): Promise<{ success?: boolean; task?: Task; error?: string }> {
    return updateTask(taskId, { status })
}

export async function completeTask(taskId: string): Promise<{ success?: boolean; error?: string }> {
    return updateTask(taskId, { completed: true, status: 'Done' })
}

// ─── Categories ───────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/categories`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

// ─── Blocker Escalation ───────────────────────────────────────────────

export async function reportTaskBlocker(
    taskId: string,
    body: {
        reason: string
        blocker_type?: 'dependency' | 'external_tool' | 'missing_data' | 'human_required'
        suggested_resolution?: string
    }
): Promise<{ data?: any; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }
    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }
    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/tasks/${taskId}/report-blocker`,
            { method: 'POST', headers, body: JSON.stringify(body) }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: (err as any).message || 'Failed to report blocker' }
        }
        revalidatePath('/dashboard')
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message }
    }
}

export async function resolveTaskBlocker(
    taskId: string
): Promise<{ data?: any; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }
    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }
    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/tasks/${taskId}/resolve-blocker`,
            { method: 'POST', headers, body: JSON.stringify({}) }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: (err as any).message || 'Failed to resolve blocker' }
        }
        revalidatePath('/dashboard')
        return { data: await res.json() }
    } catch (e: any) {
        return { error: e.message }
    }
}

// ─── Pomodoro ─────────────────────────────────────────────────────────

export async function logPomodoroSession(
    taskId: string,
    durationMinutes: number
): Promise<{ success?: boolean; error?: string }> {
    // For now, log pomodoro by adding time to the task
    const hoursToAdd = durationMinutes / 60
    return updateTask(taskId, { time_spent: hoursToAdd })
}
