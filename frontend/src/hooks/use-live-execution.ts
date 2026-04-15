'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

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
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'

function extractToken(): string | null {
    if (typeof document === 'undefined') return null
    try {
        const cookies = document.cookie.split('; ')
        const parts: Record<string, string> = {}
        for (const c of cookies) {
            const eq = c.indexOf('=')
            const name = c.substring(0, eq)
            const val = c.substring(eq + 1)
            if (name.includes('auth-token')) parts[name] = val
        }
        const sorted = Object.entries(parts).sort(([a], [b]) => a.localeCompare(b))
        const joined = sorted.map(([, v]) => v).join('')
        if (!joined) return null
        const raw = joined.startsWith('base64-') ? joined.slice(7) : joined
        return JSON.parse(atob(raw))?.access_token ?? null
    } catch { return null }
}

export function useLiveExecution(accountId: string | null) {
    const [activeTasks, setActiveTasks] = useState<ActiveOrchestration[]>([])
    const [isConnected, setIsConnected] = useState(false)

    // Initial load of active orchestrations
    const loadInitial = useCallback(async (acctId: string) => {
        try {
            const token = extractToken()
            const headers: Record<string, string> = { 'Content-Type': 'application/json' }
            if (token) headers['Authorization'] = `Bearer ${token}`

            const res = await fetch(
                `${API_URL}/accounts/${acctId}/orchestrations?status=running,pending_approval,pending&limit=50`,
                { headers }
            )
            if (!res.ok) return
            const data = await res.json()
            if (Array.isArray(data)) {
                const rootTasks = data.filter(
                    (t: ActiveOrchestration) =>
                        !t.parent_orchestrated_task_id &&
                        ACTIVE_STATUSES.has(t.status)
                )
                setActiveTasks(rootTasks)
            }
        } catch { /* silent */ }
    }, [])

    useEffect(() => {
        if (!accountId) return

        // Load initial state
        loadInitial(accountId)

        // Subscribe to Realtime for incremental updates
        const channel = supabaseBrowser
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
            .subscribe((status) => {
                setIsConnected(status === 'SUBSCRIBED')
            })

        return () => {
            supabaseBrowser.removeChannel(channel)
        }
    }, [accountId, loadInitial])

    return { activeTasks, isConnected }
}
