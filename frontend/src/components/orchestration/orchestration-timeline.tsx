'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type OrchestrationTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface OrchestrationTask {
  id: string
  title: string
  status: OrchestrationTaskStatus
  podName?: string
  backbone?: string
  dependsOn?: string[] // task titles
}

export interface OrchestrationTimelineProps {
  orchestrationId: string
  goal: string
  tasks: OrchestrationTask[]
  /** Overall orchestration status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  /** When provided, connect to WS and listen for dag.task_updated events */
  wsUrl?: string
  onTaskUpdated?: (taskId: string, status: OrchestrationTaskStatus) => void
  onRefresh?: () => void
}

const STATUS_ICON: Record<OrchestrationTaskStatus, string> = {
  pending: '⏳',
  running: '▶️',
  completed: '✅',
  failed: '❌',
  cancelled: '🚫',
}

const STATUS_BADGE: Record<OrchestrationTaskStatus, string> = {
  pending: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
  running: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  completed: 'bg-green-500/15 text-green-700 dark:text-green-400',
  failed: 'bg-destructive/15 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
}

export function OrchestrationTimeline({
  orchestrationId,
  goal,
  tasks: initialTasks,
  status,
  wsUrl,
  onTaskUpdated,
  onRefresh,
}: OrchestrationTimelineProps) {
  const [tasks, setTasks] = useState<OrchestrationTask[]>(initialTasks)
  const wsRef = useRef<WebSocket | null>(null)

  // Keep tasks in sync with props when refreshed externally
  useEffect(() => {
    setTasks(initialTasks)
  }, [initialTasks])

  // WebSocket: listen for dag.task_updated events
  useEffect(() => {
    if (!wsUrl) return

    let ws: WebSocket
    let reconnectTimeout: ReturnType<typeof setTimeout>

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.event === 'dag.task_updated' && msg.data?.orchestration_id === orchestrationId) {
              const { task_id, status: newStatus } = msg.data
              setTasks((prev) =>
                prev.map((t) => (t.id === task_id ? { ...t, status: newStatus } : t)),
              )
              onTaskUpdated?.(task_id, newStatus)
            }
          } catch {
            // ignore parse errors
          }
        }

        ws.onerror = () => {
          ws.close()
        }

        ws.onclose = () => {
          // Reconnect after 5s
          reconnectTimeout = setTimeout(connect, 5000)
        }
      } catch {
        reconnectTimeout = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimeout)
      wsRef.current?.close()
    }
  }, [wsUrl, orchestrationId, onTaskUpdated])

  const overallStatusClass = {
    pending: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    running: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    completed: 'bg-green-500/15 text-green-700 dark:text-green-400',
    failed: 'bg-destructive/15 text-destructive',
    cancelled: 'bg-muted text-muted-foreground',
  }[status]

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-muted/20">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">Orchestration</span>
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', overallStatusClass)}>
                {status}
              </Badge>
              {status === 'running' && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{goal}</p>
          </div>
          {onRefresh && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onRefresh}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Task list */}
      <div className="divide-y">
        {tasks.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No tasks in this orchestration.
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="px-4 py-3 flex items-start gap-3">
              <span className="text-base shrink-0 leading-none mt-0.5" role="img" aria-label={task.status}>
                {STATUS_ICON[task.status]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">{task.title}</span>
                  <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', STATUS_BADGE[task.status])}>
                    {task.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-3 mt-0.5">
                  {task.podName && (
                    <span className="text-[10px] text-muted-foreground">Pod: {task.podName}</span>
                  )}
                  {task.backbone && (
                    <span className="text-[10px] text-muted-foreground">via {task.backbone}</span>
                  )}
                </div>
                {task.dependsOn && task.dependsOn.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    depends on: {task.dependsOn.join(', ')}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
