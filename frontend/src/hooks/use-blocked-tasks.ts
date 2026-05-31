'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { getBlockedTasks } from '@/app/dashboard/pods/actions'

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
 * Blocked-tasks alerts (Epic 4 — pg NOTIFY + SSE, replaces Supabase Realtime).
 *
 * Loads blocked tasks via the server action, then opens an EventSource to the BFF
 * SSE proxy (/api/events). On any `tasks` event for the account, it debounce-refetches
 * the blocked list (a task may have just become blocked or unblocked).
 */
export function useBlockedTasks(accountId: string | null) {
    const [blockedTasks, setBlockedTasks] = useState<BlockedTask[]>([])
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const reload = useCallback(async () => {
        try {
            const result = await getBlockedTasks()
            if (result.error || !result.data) return
            setBlockedTasks(result.data as BlockedTask[])
        } catch { /* silent */ }
    }, [])

    useEffect(() => {
        if (!accountId) return
        reload()

        const es = new EventSource('/api/events')
        es.onmessage = (e) => {
            try {
                const evt = JSON.parse(e.data)
                if (evt?.table === 'tasks') {
                    if (debounceRef.current) clearTimeout(debounceRef.current)
                    debounceRef.current = setTimeout(reload, 250)
                }
            } catch { /* ignore heartbeats / malformed */ }
        }

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
            es.close()
        }
    }, [accountId, reload])

    return { blockedTasks }
}
