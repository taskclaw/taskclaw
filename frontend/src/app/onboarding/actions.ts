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

// ============================================================================
// Create Category
// ============================================================================

export async function createCategory(data: { name: string; color: string }) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/categories`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create category' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

// ============================================================================
// Create Source (simplified for onboarding)
// ============================================================================

export async function createSource(data: {
    provider: string
    category_id: string
    config: Record<string, any>
    sync_interval_minutes?: number
}) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/sources`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create source' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

// ============================================================================
// Get Default Categories (public, no auth)
// ============================================================================

export async function getDefaultCategories(): Promise<
    Array<{ name: string; color: string; icon: string }> | null
> {
    try {
        const res = await fetch(`${API_URL}/system-settings/default-categories`, {
            cache: 'no-store',
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

// ============================================================================
// Bulk Create Categories (for onboarding)
// ============================================================================

export async function createBulkCategories(
    categories: Array<{ name: string; color: string; icon?: string }>
) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/categories/bulk`, {
            method: 'POST',
            headers,
            body: JSON.stringify(categories),
        })
        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create categories' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

// ============================================================================
// Create Board (for default board seeding)
// ============================================================================

export async function createBoard(data: {
    name: string
    description?: string
    color?: string
    icon?: string
    is_favorite?: boolean
    steps?: Array<{ step_key: string; name: string; step_type?: string; color?: string }>
}) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: err.message || 'Failed to create board' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message || 'Network error' }
    }
}

async function createTask(data: {
    title: string
    notes?: string
    board_instance_id?: string
    priority?: string
}) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/tasks`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })
        if (!res.ok) return { error: 'Failed to create task' }
        return await res.json()
    } catch {
        return { error: 'Network error' }
    }
}

export async function seedDefaultBoards() {
    // ── Personal board ──
    const personal = await createBoard({
        name: 'Personal',
        description: 'Your personal life — health, errands, hobbies, and goals',
        color: '#EC4899',
        icon: '🏠',
        is_favorite: true,
        steps: [
            { step_key: 'todo', name: 'To Do', step_type: 'input', color: '#334155' },
            { step_key: 'in_progress', name: 'In Progress', step_type: 'input', color: '#3B82F6' },
            { step_key: 'done', name: 'Done', step_type: 'done', color: '#22C55E' },
        ],
    })

    // ── Professional board ──
    const professional = await createBoard({
        name: 'Professional',
        description: 'Work tasks, projects, meetings, and career goals',
        color: '#3B82F6',
        icon: '💼',
        is_favorite: true,
        steps: [
            { step_key: 'backlog', name: 'Backlog', step_type: 'input', color: '#334155' },
            { step_key: 'in_progress', name: 'In Progress', step_type: 'input', color: '#F97316' },
            { step_key: 'review', name: 'Review', step_type: 'human_review', color: '#8B5CF6' },
            { step_key: 'done', name: 'Done', step_type: 'done', color: '#22C55E' },
        ],
    })

    // ── Seed 5 sample tasks for each board ──
    const personalBoardId = personal?.id
    const professionalBoardId = professional?.id

    const personalTasks = [
        { title: 'Plan weekend activities', priority: 'Low' },
        { title: 'Call dentist for appointment', priority: 'Medium' },
        { title: 'Read 20 pages of a book', priority: 'Low' },
        { title: 'Grocery shopping list', priority: 'Medium' },
        { title: 'Workout session at gym', priority: 'High' },
    ]

    const professionalTasks = [
        { title: 'Prepare Q2 status report', priority: 'High' },
        { title: 'Review pull requests from team', priority: 'High' },
        { title: 'Schedule 1-on-1 with manager', priority: 'Medium' },
        { title: 'Update project documentation', priority: 'Low' },
        { title: 'Research competitor features', priority: 'Medium' },
    ]

    if (personalBoardId) {
        for (const task of personalTasks) {
            await createTask({ ...task, board_instance_id: personalBoardId })
        }
    }

    if (professionalBoardId) {
        for (const task of professionalTasks) {
            await createTask({ ...task, board_instance_id: professionalBoardId })
        }
    }

    return { personal, professional }
}

// ============================================================================
// Complete Onboarding
// ============================================================================

export async function completeOnboarding() {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    // Always set the cookie first so the user is never stuck in the onboarding loop
    const cookieStore = await cookies()
    cookieStore.set('onboarding_completed', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
    })

    if (!headers || !accountId) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ onboarding_completed: true }),
        })
        if (!res.ok) {
            // Cookie is already set — user won't be stuck
            return { success: true }
        }

        return await res.json()
    } catch {
        // Cookie is already set — user won't be stuck
        return { success: true }
    }
}
