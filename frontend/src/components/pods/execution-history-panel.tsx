'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getExecutionLog } from '@/app/dashboard/pods/actions'

const STATUS_BADGE: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    running: 'bg-blue-100 text-blue-700',
    skipped: 'bg-yellow-100 text-yellow-700',
    dry_run: 'bg-purple-100 text-purple-700',
    timeout: 'bg-orange-100 text-orange-700',
}

interface Props {
    podId?: string
    boardId?: string
}

export function ExecutionHistoryPanel({ podId, boardId }: Props) {
    const [expanded, setExpanded] = useState<string | null>(null)
    const { data: logs, isLoading } = useQuery({
        queryKey: ['execution-log', podId, boardId],
        queryFn: () => getExecutionLog({ pod_id: podId, board_id: boardId }),
    })

    if (isLoading) return <div className="animate-pulse h-32 rounded bg-muted" />
    if (!logs?.length) return <div className="text-muted-foreground text-sm py-8 text-center">No executions yet</div>

    return (
        <div className="flex flex-col gap-2">
            {logs.map((log) => (
                <div key={log.id} className="border rounded-lg overflow-hidden">
                    <div
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[log.status] || ''}`}>
                            {log.status}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">{log.trigger_type}</span>
                        <span className="flex-1 text-sm truncate">{log.summary ?? 'No summary'}</span>
                        {log.duration_ms && (
                            <span className="text-xs text-muted-foreground">{log.duration_ms}ms</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                            {new Date(log.started_at).toLocaleString()}
                        </span>
                    </div>
                    {expanded === log.id && (
                        <div className="border-t p-3 bg-muted/30">
                            {log.error_details && (
                                <div className="text-red-600 text-xs mb-2">{log.error_details}</div>
                            )}
                            {log.metadata && (
                                <pre className="text-xs overflow-auto max-h-32">
                                    {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                            )}
                            {!log.error_details && !log.metadata && (
                                <div className="text-xs text-muted-foreground">No additional details</div>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}
