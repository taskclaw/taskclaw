'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

export interface BlockedTask {
    id: string
    title: string
    status: string
    board_instance_id: string | null
    metadata: {
        blocker?: {
            reason: string
            blocker_type: string
            suggested_resolution?: string | null
            reported_at: string
        }
        [key: string]: unknown
    } | null
    account_id: string
    created_at: string
    updated_at: string
}

/**
 * Subscribes to blocked tasks via Supabase Realtime.
 *
 * On mount, fetches all tasks with status='blocked' for the account.
 * Listens for Realtime UPDATE events on the tasks table to:
 *   - Add newly-blocked tasks
 *   - Remove tasks that have been unblocked
 *
 * The cockpit and OrchCard use this to display blocker alerts without polling.
 */
export function useBlockedTasks(accountId: string | null) {
    const [blockedTasks, setBlockedTasks] = useState<BlockedTask[]>([])

    const fetchInitial = useCallback(async () => {
        if (!accountId) return
        try {
            const { data } = await supabaseBrowser
                .from('tasks')
                .select('id, title, status, board_instance_id, metadata, account_id, created_at, updated_at')
                .eq('account_id', accountId)
                .eq('status', 'blocked')
                .order('updated_at', { ascending: false })

            if (data) setBlockedTasks(data as BlockedTask[])
        } catch { /* silent */ }
    }, [accountId])

    useEffect(() => {
        if (!accountId) return

        fetchInitial()

        const channel = supabaseBrowser
            .channel(`blocked-tasks-${accountId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'tasks',
                    filter: `account_id=eq.${accountId}`,
                },
                (payload) => {
                    const updated = payload.new as BlockedTask
                    setBlockedTasks(prev => {
                        if (updated.status === 'blocked') {
                            // Upsert: replace existing or add new
                            const idx = prev.findIndex(t => t.id === updated.id)
                            if (idx >= 0) {
                                const next = [...prev]
                                next[idx] = updated
                                return next
                            }
                            return [updated, ...prev]
                        } else {
                            // Unblocked — remove from list
                            return prev.filter(t => t.id !== updated.id)
                        }
                    })
                }
            )
            .subscribe()

        return () => {
            supabaseBrowser.removeChannel(channel)
        }
    }, [accountId, fetchInitial])

    return { blockedTasks }
}
