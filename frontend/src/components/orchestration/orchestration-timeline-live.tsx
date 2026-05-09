'use client'

import { useEffect, useState, useCallback } from 'react'

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
import { OrchestrationTimeline, type OrchestrationTask } from './orchestration-timeline'

interface LiveProps {
  orchestrationId: string
  accountId: string
  authToken?: string | null
  onComplete?: () => void
}

interface OrchestratedTaskRaw {
  id: string
  goal?: string
  status: string
  pod_name?: string
  backbone?: string
  depends_on_titles?: string[]
}

interface OrchestrationDetailRaw {
  id: string
  goal?: string
  status: string
  tasks?: OrchestratedTaskRaw[]
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

export function OrchestrationTimelineLive({ orchestrationId, accountId, authToken, onComplete }: LiveProps) {
  const [data, setData] = useState<OrchestrationDetailRaw | null>(null)

  const fetch_ = useCallback(async () => {
    try {
      const token = authToken ?? extractSupabaseToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(
        `${API_URL}/accounts/${accountId}/orchestrations/${orchestrationId}`,
        { credentials: 'include', headers },
      )
      if (!res.ok) return
      const json = await res.json()
      setData(json)
      if (TERMINAL.has(json.status)) {
        onComplete?.()
      }
    } catch {
      // ignore
    }
  }, [orchestrationId, accountId, authToken, onComplete])

  useEffect(() => {
    fetch_()
    const interval = setInterval(() => {
      if (data && TERMINAL.has(data.status)) {
        clearInterval(interval)
        return
      }
      fetch_()
    }, 3000)
    return () => clearInterval(interval)
  }, [fetch_, data])

  if (!data) return null

  const tasks: OrchestrationTask[] = (data.tasks ?? []).map((t) => ({
    id: t.id,
    title: t.goal ?? t.id,
    status: (t.status ?? 'pending') as OrchestrationTask['status'],
    podName: t.pod_name,
    backbone: t.backbone,
    dependsOn: t.depends_on_titles ?? [],
  }))

  return (
    <OrchestrationTimeline
      orchestrationId={orchestrationId}
      goal={data.goal ?? 'Orchestration in progress'}
      tasks={tasks}
      status={data.status as OrchestrationTask['status']}
      onRefresh={fetch_}
    />
  )
}
