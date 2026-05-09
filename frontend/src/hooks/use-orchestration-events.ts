'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

/** Extract Supabase access_token from the sb-*-auth-token cookie (JS-accessible). */
function extractSupabaseToken(): string | null {
  if (typeof document === 'undefined') return null
  try {
    const cookies = document.cookie.split('; ')
    const parts: Record<string, string> = {}
    for (const c of cookies) {
      const eqIdx = c.indexOf('=')
      const name = c.substring(0, eqIdx)
      const val = c.substring(eqIdx + 1)
      if (name.includes('auth-token')) parts[name] = val
    }
    const sorted = Object.entries(parts).sort(([a], [b]) => a.localeCompare(b))
    const joined = sorted.map(([, v]) => v).join('')
    if (!joined) return null
    const raw = joined.startsWith('base64-') ? joined.slice(7) : joined
    const decoded = JSON.parse(atob(raw))
    return decoded?.access_token ?? null
  } catch {
    return null
  }
}

export interface ApprovalRequestedEvent {
  type: 'approval_requested'
  orchestrationId: string
  goal: string
  tasks: Array<{
    title: string
    podName: string
    backbone: string
    dependsOn: string[]
  }>
  riskLevel: 'low' | 'medium' | 'high'
  estimatedDuration?: string
}

export interface DagTaskUpdatedEvent {
  type: 'dag_task_updated'
  orchestrationId: string
  taskId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
}

export type OrchestrationEvent = ApprovalRequestedEvent | DagTaskUpdatedEvent

interface UseOrchestrationEventsOptions {
  accountId: string | null
  authToken?: string | null
  onApprovalRequested?: (event: ApprovalRequestedEvent) => void
  onTaskUpdated?: (event: DagTaskUpdatedEvent) => void
}

/**
 * Hook that polls for pending orchestration approvals and optionally
 * connects to the backend SSE/WS stream for real-time events.
 *
 * Since the backend may not have a dedicated SSE endpoint yet, this hook
 * uses polling as a reliable fallback: every 15 seconds it checks for
 * pending orchestrations and fires onApprovalRequested for any new ones.
 */
export function useOrchestrationEvents({
  accountId,
  authToken,
  onApprovalRequested,
  onTaskUpdated,
}: UseOrchestrationEventsOptions) {
  const [pendingCount, setPendingCount] = useState(0)
  const seenIds = useRef<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async () => {
    if (!accountId) return
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'
      // Prefer explicit authToken, fall back to extracting from cookie
      const token = authToken ?? extractSupabaseToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(
        `${API_URL}/accounts/${accountId}/orchestrations?status=pending_approval&limit=20`,
        { credentials: 'include', headers },
      )
      if (!res.ok) return
      const data = await res.json()
      const items: any[] = data?.data || data || []

      const pending = items.filter((o: any) => o.status === 'pending_approval')
      setPendingCount(pending.length)

      // Fire callback for newly seen approvals
      for (const orch of pending) {
        if (!seenIds.current.has(orch.id)) {
          seenIds.current.add(orch.id)
          if (onApprovalRequested) {
            onApprovalRequested({
              type: 'approval_requested',
              orchestrationId: orch.id,
              goal: orch.goal || orch.description || 'Orchestration requires approval',
              tasks: (orch.tasks || []).map((t: any) => ({
                title: t.title || t.name || 'Task',
                podName: t.pod_name || t.pod?.name || '—',
                backbone: t.backbone || t.backbone_connection?.name || '—',
                dependsOn: t.depends_on_titles || t.depends_on || [],
              })),
              riskLevel: orch.risk_level || 'medium',
              estimatedDuration: orch.estimated_duration,
            })
          }
        }
      }

      // Remove from seenIds if no longer pending (approved/rejected)
      const pendingIdSet = new Set(pending.map((o: any) => o.id))
      for (const id of Array.from(seenIds.current)) {
        if (!pendingIdSet.has(id)) {
          // Keep in seen so we don't re-fire
        }
      }
    } catch {
      // Ignore network errors silently
    }
  }, [accountId, authToken, onApprovalRequested])

  useEffect(() => {
    if (!accountId) return
    poll()
    intervalRef.current = setInterval(poll, 15000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [accountId, poll])

  const clearPending = useCallback(() => {
    setPendingCount(0)
  }, [])

  return { pendingCount, clearPending, refetch: poll }
}
