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
    const accountId = cookieStore.get('current_account_id')?.value
    
    console.log('[getCurrentAccountId] Cookie value:', accountId)
    console.log('[getCurrentAccountId] All cookies:', 
        Array.from(cookieStore.getAll()).map(c => c.name).join(', '))
    
    return accountId
}

export async function getConversations() {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    
    if (!headers || !accountId) return { data: [] }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/conversations`, {
            headers,
            cache: 'no-store',
        })
        
        if (!res.ok) return { data: [] }
        return await res.json()
    } catch (error) {
        console.error('Failed to load conversations:', error)
        return { data: [] }
    }
}

export async function getMessages(conversationId: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) {
        console.warn('[getMessages] Missing auth — headers:', !!headers, 'accountId:', accountId)
        return { data: [] }
    }

    try {
        const url = `${API_URL}/accounts/${accountId}/conversations/${conversationId}/messages`
        const res = await fetch(url, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) {
            const errorBody = await res.text().catch(() => 'unknown')
            console.error('[getMessages] API error:', res.status, errorBody)
            return { data: [] }
        }
        const data = await res.json()
        console.log('[getMessages] Loaded', data?.data?.length || 0, 'messages for conversation', conversationId.slice(0, 8))
        return data
    } catch (error) {
        console.error('[getMessages] Failed to load messages:', error)
        return { data: [] }
    }
}

export async function getSkills() {
    try {
        const accountId = await getCurrentAccountId();
        const headers = await getAuthHeaders();
        if (!headers || !accountId) {
            throw new Error('Not authenticated');
        }

        const res = await fetch(`${API_URL}/accounts/${accountId}/skills?active_only=true`, {
            headers,
            cache: 'no-store',
        });

        if (!res.ok) {
            throw new Error('Failed to fetch skills');
        }

        return await res.json();
    } catch (error) {
        console.error('[getSkills] Error:', error);
        return [];
    }
}

export async function createConversation(title?: string, taskId?: string, skillIds?: string[], podId?: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    console.log('[createConversation] Debug:', {
        hasHeaders: !!headers,
        accountId,
        timestamp: new Date().toISOString()
    })

    if (!headers || !accountId) {
        console.error('[createConversation] Missing auth:', { headers: !!headers, accountId })
        return { error: 'Not authenticated' }
    }

    try {
        const url = `${API_URL}/accounts/${accountId}/conversations`
        console.log('[createConversation] Calling API:', url)

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                title: title || 'New Conversation',
                task_id: taskId,
                skill_ids: skillIds || [],
                pod_id: podId,
            }),
        })

        console.log('[createConversation] Response status:', res.status)

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'Unknown error' }))
            console.error('[createConversation] API error:', errorData)
            return { error: errorData.message || 'Failed to create conversation' }
        }

        const data = await res.json()
        console.log('[createConversation] Success:', data.id)
        return data
    } catch (error: any) {
        console.error('[createConversation] Exception:', error)
        return { error: error.message || 'Network error' }
    }
}

/**
 * Check if a task already has a conversation with messages (lightweight check).
 */
export async function hasTaskConversation(taskId: string): Promise<boolean> {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) return false

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/conversations?task_id=${taskId}&limit=1`,
            { headers, cache: 'no-store' },
        )
        if (!res.ok) return false
        const data = await res.json()
        return (data?.data?.length || 0) > 0
    } catch {
        return false
    }
}

/**
 * Find existing conversation for a task, or create a new one.
 * Prevents duplicate conversations and preserves chat history.
 */
export async function getOrCreateConversation(taskId: string, taskTitle: string, skillIds?: string[]) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) {
        console.warn('[getOrCreateConversation] Missing auth — headers:', !!headers, 'accountId:', accountId)
        return { error: 'Not authenticated' }
    }

    try {
        // First: look for an existing conversation linked to this task
        const listUrl = `${API_URL}/accounts/${accountId}/conversations?task_id=${taskId}&limit=1`
        console.log('[getOrCreateConversation] Looking for existing conversation:', listUrl)

        const listRes = await fetch(listUrl, { headers, cache: 'no-store' })

        if (listRes.ok) {
            const listData = await listRes.json()
            console.log('[getOrCreateConversation] List response:', {
                dataLength: listData?.data?.length || 0,
                firstId: listData?.data?.[0]?.id?.slice(0, 8) || 'none',
                total: listData?.pagination?.total || 0,
            })
            const existing = listData?.data?.[0]
            if (existing?.id) {
                console.log('[getOrCreateConversation] Reusing existing conversation:', existing.id)
                return existing
            }
        } else {
            console.error('[getOrCreateConversation] List request failed:', listRes.status)
        }

        // No existing conversation — create a new one
        console.log('[getOrCreateConversation] No existing conversation, creating new one for task:', taskId)
        return await createConversation(`Task: ${taskTitle}`, taskId, skillIds)
    } catch (error: any) {
        console.error('[getOrCreateConversation] Error:', error)
        return { error: error.message || 'Failed to get or create conversation' }
    }
}

export async function sendMessage(conversationId: string, content: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    
    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/conversations/${conversationId}/messages`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ content }),
            }
        )
        
        if (!res.ok) {
            const error = await res.json()
            return { error: error.message || 'Failed to send message' }
        }
        
        return await res.json()
    } catch (error: any) {
        return { error: error.message || 'Network error' }
    }
}

export async function sendMessageBackground(conversationId: string, content: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/conversations/${conversationId}/messages/background`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ content }),
            }
        )

        if (!res.ok) {
            const error = await res.json()
            return { error: error.message || 'Failed to send message' }
        }

        return await res.json()
    } catch (error: any) {
        return { error: error.message || 'Network error' }
    }
}

export async function deleteConversation(conversationId: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    
    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/conversations/${conversationId}`,
            {
                method: 'DELETE',
                headers,
            }
        )
        
        if (!res.ok) {
            return { error: 'Failed to delete conversation' }
        }
        
        return { success: true }
    } catch (error: any) {
        return { error: error.message || 'Network error' }
    }
}

/**
 * Sprint 7: Save AI findings to a task and trigger outbound sync to Notion/ClickUp
 */
export async function saveAiToTask(
    taskId: string,
    content: string,
    conversationId?: string,
) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/tasks/${taskId}/ai-update`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    notes_append: content,
                    conversation_id: conversationId,
                }),
            }
        )

        if (!res.ok) {
            const error = await res.json().catch(() => ({ message: 'Unknown error' }))
            return { error: error.message || 'Failed to save to task' }
        }

        return await res.json()
    } catch (error: any) {
        return { error: error.message || 'Network error' }
    }
}

/**
 * Find existing conversation for a board, or create a new one.
 * Prevents duplicate board conversations and preserves chat history.
 */
export async function getOrCreateBoardConversation(boardId: string, boardName: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        // Look for existing board conversation
        const listUrl = `${API_URL}/accounts/${accountId}/conversations?board_id=${boardId}&limit=1`
        const listRes = await fetch(listUrl, { headers, cache: 'no-store' })

        if (listRes.ok) {
            const listData = await listRes.json()
            const existing = listData?.data?.[0]
            if (existing?.id) {
                return existing
            }
        }

        // No existing conversation — create a new one
        const res = await fetch(`${API_URL}/accounts/${accountId}/conversations`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                title: `Board Chat: ${boardName}`,
                board_id: boardId,
            }),
        })

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'Unknown error' }))
            return { error: errorData.message || 'Failed to create board conversation' }
        }

        return await res.json()
    } catch (error: any) {
        return { error: error.message || 'Failed to get or create board conversation' }
    }
}

export async function getOrCreatePodConversation(podId: string, podName: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        // Look for existing pod conversation
        const listUrl = `${API_URL}/accounts/${accountId}/conversations?pod_id=${podId}&limit=1`
        const listRes = await fetch(listUrl, { headers, cache: 'no-store' })

        if (listRes.ok) {
            const listData = await listRes.json()
            const existing = listData?.data?.[0]
            if (existing?.id) return existing
        }

        // Create new pod conversation
        const res = await fetch(`${API_URL}/accounts/${accountId}/conversations`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ title: `Pod Chat: ${podName}`, pod_id: podId }),
        })

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'Unknown error' }))
            return { error: errorData.message || 'Failed to create pod conversation' }
        }

        return await res.json()
    } catch (error: any) {
        return { error: error.message || 'Failed to get or create pod conversation' }
    }
}

export async function getOrCreateWorkspaceConversation() {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()

    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        // Look for existing workspace-level conversation (no board_id, no pod_id, no task_id)
        const listUrl = `${API_URL}/accounts/${accountId}/conversations?workspace=true&limit=1`
        const listRes = await fetch(listUrl, { headers, cache: 'no-store' })

        if (listRes.ok) {
            const listData = await listRes.json()
            const existing = listData?.data?.[0]
            if (existing?.id) return existing
        }

        // Create new workspace conversation
        const res = await fetch(`${API_URL}/accounts/${accountId}/conversations`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ title: 'Workspace Chat', is_workspace: true }),
        })

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'Unknown error' }))
            return { error: errorData.message || 'Failed to create workspace conversation' }
        }

        return await res.json()
    } catch (error: any) {
        return { error: error.message || 'Failed to get or create workspace conversation' }
    }
}

export async function updateConversationTitle(conversationId: string, title: string) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    
    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        const res = await fetch(
            `${API_URL}/accounts/${accountId}/conversations/${conversationId}`,
            {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ title }),
            }
        )
        
        if (!res.ok) {
            return { error: 'Failed to update conversation' }
        }
        
        return await res.json()
    } catch (error: any) {
        return { error: error.message || 'Network error' }
    }
}
