'use server'

import { getAuthToken, isTokenExpired } from '@/lib/auth'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { Agent, AgentActivity, CreateAgentInput, UpdateAgentInput } from '@/types/agent'
import type { AgentDashboardItem } from '@/types/board'

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

// ── Legacy dashboard (categories-based) ───────────────────────────────────────
export async function getAgentsDashboard(): Promise<AgentDashboardItem[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []
    const accountId = await getActiveAccountId()
    if (!accountId) return []
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/skills/agents/dashboard`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

// ── New Agents API (F01+) ──────────────────────────────────────────────────────

export async function getAgents(filters?: { status?: string; agent_type?: string }): Promise<Agent[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []
    const accountId = await getActiveAccountId()
    if (!accountId) return []
    try {
        const params = new URLSearchParams()
        if (filters?.status) params.set('status', filters.status)
        if (filters?.agent_type) params.set('agent_type', filters.agent_type)
        const qs = params.toString()
        const res = await fetch(`${API_URL}/accounts/${accountId}/agents${qs ? `?${qs}` : ''}`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function getAgent(agentId: string): Promise<Agent | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null
    const accountId = await getActiveAccountId()
    if (!accountId) return null
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/agents/${agentId}`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

export async function createAgent(input: CreateAgentInput): Promise<Agent | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null
    const accountId = await getActiveAccountId()
    if (!accountId) return null
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/agents`, {
            method: 'POST',
            headers,
            body: JSON.stringify(input),
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err?.message || 'Failed to create agent')
        }
        const agent = await res.json()
        revalidatePath('/dashboard/agents')
        return agent
    } catch (e) {
        throw e
    }
}

export async function updateAgent(agentId: string, input: UpdateAgentInput): Promise<Agent | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null
    const accountId = await getActiveAccountId()
    if (!accountId) return null
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/agents/${agentId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(input),
        })
        if (!res.ok) return null
        const agent = await res.json()
        revalidatePath('/dashboard/agents')
        return agent
    } catch {
        return null
    }
}

export async function deleteAgent(agentId: string): Promise<boolean> {
    const headers = await getAuthHeaders()
    if (!headers) return false
    const accountId = await getActiveAccountId()
    if (!accountId) return false
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/agents/${agentId}`, {
            method: 'DELETE',
            headers,
        })
        if (!res.ok) return false
        revalidatePath('/dashboard/agents')
        return true
    } catch {
        return false
    }
}

export async function pauseAgent(agentId: string): Promise<Agent | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null
    const accountId = await getActiveAccountId()
    if (!accountId) return null
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/agents/${agentId}/pause`, {
            method: 'POST',
            headers,
        })
        if (!res.ok) return null
        revalidatePath('/dashboard/agents')
        return await res.json()
    } catch {
        return null
    }
}

export async function resumeAgent(agentId: string): Promise<Agent | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null
    const accountId = await getActiveAccountId()
    if (!accountId) return null
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/agents/${agentId}/resume`, {
            method: 'POST',
            headers,
        })
        if (!res.ok) return null
        revalidatePath('/dashboard/agents')
        return await res.json()
    } catch {
        return null
    }
}

export async function cloneAgent(agentId: string, name?: string): Promise<Agent | null> {
    const headers = await getAuthHeaders()
    if (!headers) return null
    const accountId = await getActiveAccountId()
    if (!accountId) return null
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/agents/${agentId}/clone`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name }),
        })
        if (!res.ok) return null
        revalidatePath('/dashboard/agents')
        return await res.json()
    } catch {
        return null
    }
}

export async function getAgentSkills(agentId: string): Promise<any[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []
    const accountId = await getActiveAccountId()
    if (!accountId) return []
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/agents/${agentId}/skills`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function addSkillToAgent(agentId: string, skillId: string): Promise<any> {
    const headers = await getAuthHeaders()
    if (!headers) throw new Error('Not authenticated')
    const accountId = await getActiveAccountId()
    if (!accountId) throw new Error('No account')
    const res = await fetch(`${API_URL}/accounts/${accountId}/agents/${agentId}/skills/${skillId}`, {
        method: 'POST',
        headers,
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || 'Failed to add skill')
    }
    revalidatePath(`/dashboard/agents/${agentId}`)
    return await res.json()
}

export async function removeSkillFromAgent(agentId: string, skillId: string): Promise<void> {
    const headers = await getAuthHeaders()
    if (!headers) throw new Error('Not authenticated')
    const accountId = await getActiveAccountId()
    if (!accountId) throw new Error('No account')
    const res = await fetch(`${API_URL}/accounts/${accountId}/agents/${agentId}/skills/${skillId}`, {
        method: 'DELETE',
        headers,
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || 'Failed to remove skill')
    }
    revalidatePath(`/dashboard/agents/${agentId}`)
}

export async function getAgentKnowledge(agentId: string): Promise<any[]> {
    const headers = await getAuthHeaders()
    if (!headers) return []
    const accountId = await getActiveAccountId()
    if (!accountId) return []
    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/agents/${agentId}/knowledge`, {
            headers,
            cache: 'no-store',
        })
        if (!res.ok) return []
        return await res.json()
    } catch {
        return []
    }
}

export async function getAgentActivity(
    agentId: string,
    page = 1,
    limit = 20,
): Promise<{ data: AgentActivity[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const headers = await getAuthHeaders()
    if (!headers) return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } }
    const accountId = await getActiveAccountId()
    if (!accountId) return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } }
    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/agents/${agentId}/activity?page=${page}&limit=${limit}`,
            { headers, cache: 'no-store' },
        )
        if (!res.ok) return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } }
        return await res.json()
    } catch {
        return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } }
    }
}
