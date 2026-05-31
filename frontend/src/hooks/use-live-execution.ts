'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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

const ACTIVE_STATUSES = new Set(['pending_approval', 'running', 'pending'])

/**
 * Live execution view (Epic 4 — pg NOTIFY + SSE, replaces Supabase Realtime).
 *
 * Loads active root orchestrations, then opens an EventSource to the BFF SSE proxy
 * (/api/events). On any `orchestrated_tasks` event for the account, it debounce-
 * refetches the authoritative list via the server action.
 */
export function useLiveExecution(accountId: string | null) {
    const [activeTasks, setActiveTasks] = useState<ActiveOrchestration[]>([])
    const [isConnected, setIsConnected] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const reload = useCallback(async () => {
        try {
            const result = await getActiveOrchestrations()
            if (result.error || !result.data) return
            const rootTasks = result.data.filter(
                (t: ActiveOrchestration) =>
                    !t.parent_orchestrated_task_id && ACTIVE_STATUSES.has(t.status)
            )
            setActiveTasks(rootTasks)
        } catch { /* silent */ }
    }, [])

    useEffect(() => {
        if (!accountId) return
        reload()

        const es = new EventSource('/api/events')
        es.onopen = () => setIsConnected(true)
        es.onerror = () => setIsConnected(false)
        es.onmessage = (e) => {
            try {
                const evt = JSON.parse(e.data)
                if (evt?.table === 'orchestrated_tasks') {
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

    return { activeTasks, isConnected }
}
