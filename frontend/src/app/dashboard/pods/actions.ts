'use server'

import { revalidatePath } from 'next/cache'
import { getAuthToken, isTokenExpired } from '@/lib/auth'
import { cookies } from 'next/headers'
import type { Pod, CreatePodPayload, UpdatePodPayload, HeartbeatConfig, ExecutionLog, BoardRoute } from '@/types/pod'

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

// ─── Pods ──────────────────────────────────────────────────────────

export async function getPods(): Promise<Pod[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/pods`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function getPod(podId: string): Promise<Pod | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null

    const accountId = await getActiveAccountId()
    if (!accountId) return null

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/pods/${podId}`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

export async function getPodBySlug(slug: string): Promise<Pod | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null

    const accountId = await getActiveAccountId()
    if (!accountId) return null

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/pods/by-slug/${slug}`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

export async function createPod(payload: CreatePodPayload): Promise<{ success?: boolean; pod?: Pod; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/pods`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create pod' }
        }

        const pod = await res.json()
        revalidatePath('/dashboard/cockpit')
        revalidatePath('/dashboard')
        return { success: true, pod }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updatePod(podId: string, payload: UpdatePodPayload): Promise<{ success?: boolean; pod?: Pod; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/pods/${podId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to update pod' }
        }

        const pod = await res.json()
        revalidatePath('/dashboard/cockpit')
        revalidatePath('/dashboard')
        return { success: true, pod }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function deletePod(podId: string): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/pods/${podId}`, {
            method: 'DELETE',
            headers,
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to delete pod' }
        }

        revalidatePath('/dashboard/cockpit')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function getPodBoards(podId: string): Promise<any[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards?pod_id=${podId}`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

// ─── Board–Pod Assignment ────────────────────────────────────────────

export async function assignBoardToPod(boardId: string, podId: string): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }
    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ pod_id: podId }),
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: err.message || 'Failed to assign board to pod' }
        }
        revalidatePath(`/dashboard/pods`)
        return { success: true }
    } catch (e: any) {
        return { error: e.message }
    }
}

export async function removeFromPod(boardId: string): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }
    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards/${boardId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ pod_id: null }),
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: err.message || 'Failed to remove board from pod' }
        }
        revalidatePath(`/dashboard/pods`)
        return { success: true }
    } catch (e: any) {
        return { error: e.message }
    }
}

export async function getAllBoards(): Promise<any[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []
    const accountId = await getActiveAccountId()
    if (!accountId) return []
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/boards`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

// ─── Execution Log ──────────────────────────────────────────────────

export async function getExecutionLog(filters?: {
    pod_id?: string
    board_id?: string
    status?: string
    trigger_type?: string
}): Promise<ExecutionLog[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const params = new URLSearchParams()
        if (filters?.pod_id) params.set('pod_id', filters.pod_id)
        if (filters?.board_id) params.set('board_id', filters.board_id)
        if (filters?.status) params.set('status', filters.status)
        if (filters?.trigger_type) params.set('trigger_type', filters.trigger_type)

        const queryString = params.toString()
        const url = `${API_URL}/accounts/${accountId}/heartbeat/execution-log${queryString ? `?${queryString}` : ''}`

        const res = await fetch(url, { headers, cache: 'no-store' })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

// ─── Heartbeat Configs ──────────────────────────────────────────────

export async function getHeartbeatConfigs(podId?: string): Promise<HeartbeatConfig[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const params = new URLSearchParams()
        if (podId) params.set('pod_id', podId)

        const queryString = params.toString()
        const url = `${API_URL}/accounts/${accountId}/heartbeat/configs${queryString ? `?${queryString}` : ''}`

        const res = await fetch(url, { headers, cache: 'no-store' })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function createHeartbeatConfig(payload: Partial<HeartbeatConfig>): Promise<{ success?: boolean; config?: HeartbeatConfig; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/heartbeat/configs`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create heartbeat config' }
        }

        const config = await res.json()
        return { success: true, config }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updateHeartbeatConfig(
    configId: string,
    payload: Partial<HeartbeatConfig>
): Promise<{ success?: boolean; config?: HeartbeatConfig; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/heartbeat/configs/${configId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to update heartbeat config' }
        }

        const config = await res.json()
        return { success: true, config }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function toggleHeartbeat(configId: string, isActive: boolean): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/heartbeat/configs/${configId}/toggle`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ is_active: isActive }),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to toggle heartbeat' }
        }

        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function triggerHeartbeat(configId: string): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/heartbeat/configs/${configId}/trigger`, {
            method: 'POST',
            headers,
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to trigger heartbeat' }
        }

        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

// ─── Board Routes ──────────────────────────────────────────────────

export async function getBoardRoutes(): Promise<BoardRoute[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []

    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/board-routing/routes`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

// ─── Pilot Configs ──────────────────────────────────────────────────

export interface PilotConfig {
    id: string
    account_id: string
    pod_id: string | null
    backbone_connection_id: string | null
    system_prompt: string
    is_active: boolean
    max_tasks_per_cycle: number
    approval_required: boolean
    last_run_at: string | null
    last_run_summary: string | null
    created_at: string
    updated_at: string
}

export async function getPilotConfig(podId?: string | null): Promise<PilotConfig | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null
    const accountId = await getActiveAccountId()
    if (!accountId) return null

    try {
        const params = new URLSearchParams()
        if (podId) params.set('pod_id', podId)
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/pilot/configs?${params.toString()}`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return null
        const data = await res.json()
        // API returns array — get first matching
        const arr = Array.isArray(data) ? data : []
        return arr.find((c: PilotConfig) => c.pod_id === (podId || null)) || null
    } catch {
        return null
    }
}

export async function upsertPilotConfig(
    payload: Partial<PilotConfig> & { pod_id?: string | null }
): Promise<{ success?: boolean; config?: PilotConfig; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }
    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/pilot/configs`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: err.message || 'Failed to save pilot config' }
        }
        const config = await res.json()
        revalidatePath('/dashboard/cockpit')
        return { success: true, config }
    } catch (e: any) {
        return { error: e.message }
    }
}

export async function runPilot(podId?: string | null): Promise<{
    status?: string
    summary?: string
    actions_taken?: number
    error?: string
}> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }
    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const params = new URLSearchParams()
        if (podId) params.set('pod_id', podId)
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/pilot/run?${params.toString()}`,
            { method: 'POST', headers }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: err.message || 'Pilot run failed' }
        }
        return await res.json()
    } catch (e: any) {
        return { error: e.message }
    }
}

// ─── DAG Approvals ──────────────────────────────────────────────────

export interface TaskDag {
    id: string
    account_id: string
    pod_id: string | null
    goal: string
    status: string
    approved_at: string | null
    created_at: string
    tasks?: { id: string; title: string; completed: boolean; status: string }[]
    dag_approvals?: { id: string; status: string; notes: string | null }[]
}

export async function getPodDags(podId: string): Promise<TaskDag[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []
    const accountId = await getActiveAccountId()
    if (!accountId) return []

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/board-routing/dags?pod_id=${podId}`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function approveDag(
    dagId: string,
    notes?: string
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }
    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/board-routing/dags/${dagId}/approve`,
            { method: 'POST', headers, body: JSON.stringify({ notes }) }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: err.message || 'Failed to approve' }
        }
        return { success: true }
    } catch (e: any) {
        return { error: e.message }
    }
}

export async function rejectDag(
    dagId: string,
    notes?: string
): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }
    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/board-routing/dags/${dagId}/reject`,
            { method: 'POST', headers, body: JSON.stringify({ notes }) }
        )
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: err.message || 'Failed to reject' }
        }
        return { success: true }
    } catch (e: any) {
        return { error: e.message }
    }
}

export async function getPodRoutesFiltered(podId: string): Promise<BoardRoute[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []
    const accountId = await getActiveAccountId()
    if (!accountId) return []
    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/board-routing/routes?pod_id=${podId}`,
            { headers, cache: 'no-store' }
        )
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function createBoardRoute(payload: Partial<BoardRoute>): Promise<{ success?: boolean; route?: BoardRoute; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/board-routing/routes`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            const err = await res.json()
            return { error: err.message || 'Failed to create board route' }
        }

        const route = await res.json()
        return { success: true, route }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function deleteBoardRoute(routeId: string): Promise<{ success?: boolean; error?: string }> {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }
    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/board-routing/routes/${routeId}`, {
            method: 'DELETE',
            headers,
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { error: err.message || 'Failed to delete route' }
        }
        return { success: true }
    } catch (e: any) {
        return { error: e.message }
    }
}
