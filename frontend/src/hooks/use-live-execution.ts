'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { getActiveOrchestrations } from '@/app/dashboard/pods/actions'

export interface ActiveOrchestration {
    id: string
    goal: string
    status: string
    pod_id: string
    account_id: string
    created_at: string
    parent_orchestrated_task_id: string | null
    pod_name?: string
    pod_slug?: string
}

/** A board task that was created by a pod agent during orchestration */
export interface LiveTask {
    id: string
    title: string
    status: string
    priority: string
    board_instance_id: string
    account_id: string
    created_at: string
    /** The orchestrated_task id this board task belongs to */
    orchestration_id: string
}

const ACTIVE_STATUSES = new Set(['pending_approval', 'running', 'pending'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export function useLiveExecution(accountId: string | null) {
    const [activeTasks, setActiveTasks] = useState<ActiveOrchestration[]>([])
    const [isConnected, setIsConnected] = useState(false)

    // Initial load of active orchestrations via server action (reads HttpOnly auth_token)
    const loadInitial = useCallback(async () => {
        try {
            const result = await getActiveOrchestrations()
            if (result.error || !result.data) return
            const rootTasks = result.data.filter(
                (t: ActiveOrchestration) =>
                    !t.parent_orchestrated_task_id &&
                    ACTIVE_STATUSES.has(t.status)
            )
            setActiveTasks(rootTasks)
        } catch { /* silent */ }
    }, [])

    useEffect(() => {
        if (!accountId) return

        // Load initial state via server action
        loadInitial()

        // Subscribe to Realtime for orchestrated_tasks updates
        const orchChannel = supabaseBrowser
            .channel(`live-execution-${accountId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orchestrated_tasks',
                    filter: `account_id=eq.${accountId}`,
                },
                (payload) => {
                    const updated = payload.new as ActiveOrchestration
                    setActiveTasks(prev => {
                        // If task moved to terminal status, remove from active list
                        if (TERMINAL_STATUSES.has(updated.status)) {
                            return prev.filter(t => t.id !== updated.id)
                        }
                        // Update in place or add if new root task
                        const idx = prev.findIndex(t => t.id === updated.id)
                        if (idx >= 0) {
                            const next = [...prev]
                            next[idx] = { ...next[idx], ...updated }
                            return next
                        }
                        // Only track root tasks (no parent)
                        if (!updated.parent_orchestrated_task_id && ACTIVE_STATUSES.has(updated.status)) {
                            return [...prev, updated]
                        }
                        return prev
                    })
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'orchestrated_tasks',
                    filter: `account_id=eq.${accountId}`,
                },
                (payload) => {
                    const inserted = payload.new as ActiveOrchestration
                    // Only track root tasks that are in an active status
                    if (
                        !inserted.parent_orchestrated_task_id &&
                        ACTIVE_STATUSES.has(inserted.status)
                    ) {
                        setActiveTasks(prev => {
                            // Avoid duplicates
                            if (prev.some(t => t.id === inserted.id)) return prev
                            return [...prev, inserted]
                        })
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'orchestrated_tasks',
                    filter: `account_id=eq.${accountId}`,
                },
                (payload) => {
                    const deleted = payload.old as { id: string }
                    setActiveTasks(prev => prev.filter(t => t.id !== deleted.id))
                }
            )
            .subscribe((status) => {
                setIsConnected(status === 'SUBSCRIBED')
            })

        return () => {
            supabaseBrowser.removeChannel(orchChannel)
        }
    }, [accountId, loadInitial])

    return { activeTasks, isConnected }
}
