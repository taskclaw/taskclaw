'use client'

import { useState } from 'react'

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
import { CheckCircle, XCircle, AlertTriangle, Loader2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface DAGApprovalTask {
  title: string
  podName: string
  backbone: string
  dependsOn: string[]
}

export interface DAGApprovalCardProps {
  orchestrationId: string
  goal: string
  tasks: DAGApprovalTask[]
  estimatedDuration?: string
  riskLevel: 'low' | 'medium' | 'high'
  onApprove: () => void
  onReject: () => void
  accountId?: string
  authToken?: string | null
}

const riskConfig = {
  low: { label: 'Low risk', className: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20' },
  medium: { label: 'Medium risk', className: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20' },
  high: { label: 'High risk', className: 'bg-destructive/15 text-destructive border-destructive/20' },
}

export function DAGApprovalCard({
  orchestrationId,
  goal,
  tasks,
  estimatedDuration,
  riskLevel,
  onApprove,
  onReject,
  accountId,
  authToken,
}: DAGApprovalCardProps) {
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null)

  const risk = riskConfig[riskLevel]

  function getAuthHeader(): Record<string, string> {
    const token = authToken ?? extractSupabaseToken()
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
  }

  const handleApprove = async () => {
    if (done) return
    setApproving(true)
    try {
      if (accountId) {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}/accounts/${accountId}/orchestrations/${orchestrationId}/approve`,
          { method: 'POST', headers: getAuthHeader() },
        )
        if (!res.ok) throw new Error('Failed to approve')
      }
      setDone('approved')
      onApprove()
    } catch {
      // fall through — parent handles
      setDone('approved')
      onApprove()
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async () => {
    if (done) return
    setRejecting(true)
    try {
      if (accountId) {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}/accounts/${accountId}/orchestrations/${orchestrationId}/reject`,
          { method: 'POST', headers: getAuthHeader() },
        )
        if (!res.ok) throw new Error('Failed to reject')
      }
      setDone('rejected')
      onReject()
    } catch {
      setDone('rejected')
      onReject()
    } finally {
      setRejecting(false)
    }
  }

  const busy = approving || rejecting

  return (
    <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-yellow-50 dark:bg-yellow-500/10 border-b border-yellow-200 dark:border-yellow-500/20 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                Orchestration approval required
              </p>
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', risk.className)}>
                {risk.label}
              </Badge>
            </div>
            <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1 leading-relaxed">
              {goal}
            </p>
            {estimatedDuration && (
              <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Est. {estimatedDuration}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Task table */}
      {tasks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Task</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Pod</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Backbone</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Depends on</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-2 font-medium">{task.title}</td>
                  <td className="px-4 py-2 text-muted-foreground">{task.podName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{task.backbone}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {task.dependsOn.length > 0 ? task.dependsOn.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 flex items-center gap-3 bg-muted/10">
        {done === 'approved' && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="w-4 h-4" />
            Approved — execution started
          </div>
        )}
        {done === 'rejected' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <XCircle className="w-4 h-4" />
            Rejected
          </div>
        )}
        {!done && (
          <>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleApprove}
              disabled={busy}
            >
              {approving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={handleReject}
              disabled={busy}
            >
              {rejecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <XCircle className="w-3.5 h-3.5 mr-1.5" />
              )}
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
