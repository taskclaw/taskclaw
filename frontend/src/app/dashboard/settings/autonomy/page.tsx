'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getExecutionLog } from '@/app/dashboard/pods/actions'
import type { ExecutionLog } from '@/types/pod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Loader2,
    CheckCircle2,
    XCircle,
    AlertCircle,
    RefreshCw,
    Clock,
    ChevronDown,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

function triggerBadgeClass(type: string): string {
    switch (type) {
        case 'heartbeat':
            return 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
        case 'coordinator':
            return 'bg-purple-500/15 text-purple-700 dark:text-purple-400'
        case 'dag_step':
            return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
        case 'route_transfer':
            return 'bg-teal-500/15 text-teal-700 dark:text-teal-400'
        case 'manual':
            return 'bg-slate-500/15 text-slate-700 dark:text-slate-400'
        default:
            return ''
    }
}

function statusBadgeClass(status: string): string {
    switch (status) {
        case 'success':
            return 'bg-green-500/15 text-green-700 dark:text-green-400'
        case 'error':
            return 'bg-destructive/15 text-destructive'
        case 'running':
            return 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
        case 'skipped':
            return 'bg-muted text-muted-foreground'
        case 'dry_run':
            return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
        case 'timeout':
            return 'bg-orange-500/15 text-orange-700 dark:text-orange-400'
        default:
            return ''
    }
}

function StatusIcon({ status }: { status: string }) {
    if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
    if (status === 'error') return <XCircle className="w-4 h-4 text-destructive shrink-0" />
    if (status === 'running') return <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
    return <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
}

function formatDuration(ms: number | null | undefined): string {
    if (ms == null) return '—'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

export default function AutonomyPage() {
    const [offset, setOffset] = useState(0)
    const [expandedLog, setExpandedLog] = useState<ExecutionLog | null>(null)
    const [allLogs, setAllLogs] = useState<ExecutionLog[]>([])

    // Auto-refresh every 30s
    const { isLoading, refetch, isFetching, data } = useQuery({
        queryKey: ['execution-logs'],
        queryFn: async () => {
            // NOTE: Uses existing /heartbeat/execution-log endpoint from v1 backend.
            const result = await getExecutionLog({})
            return result || []
        },
        refetchInterval: 30000,
        staleTime: 15000,
    })

    const logs: ExecutionLog[] = data || []
    const visibleLogs = logs.slice(0, offset + PAGE_SIZE)
    const hasMore = visibleLogs.length < logs.length

    return (
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 max-w-3xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Autonomy</h2>
                    <p className="text-muted-foreground text-sm">
                        Execution log for all automated actions — heartbeats, pilots, DAGs, and routes.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isFetching}
                >
                    {isFetching ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Refresh
                </Button>
            </div>

            {/* Auto-refresh indicator */}
            <p className="text-[10px] text-muted-foreground -mt-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Auto-refreshes every 30 seconds
            </p>

            {/* Table */}
            {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading execution log...
                </div>
            ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <AlertCircle className="w-10 h-10 text-muted-foreground/30" />
                    <div>
                        <p className="font-medium text-sm">No executions yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Heartbeat, Pilot, and DAG executions will appear here.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    {visibleLogs.map((log) => (
                        <div
                            key={log.id}
                            className="border rounded-lg bg-card p-3 flex items-start gap-3 hover:bg-accent/20 transition-colors cursor-pointer group"
                            onClick={() => setExpandedLog(log)}
                        >
                            <StatusIcon status={log.status} />

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge
                                        variant="outline"
                                        className={cn('text-[10px] px-1.5 py-0', triggerBadgeClass(log.trigger_type))}
                                    >
                                        {log.trigger_type}
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className={cn('text-[10px] px-1.5 py-0', statusBadgeClass(log.status))}
                                    >
                                        {log.status}
                                    </Badge>
                                </div>

                                {log.summary && (
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                        {log.summary.length > 100
                                            ? log.summary.slice(0, 100) + '…'
                                            : log.summary}
                                    </p>
                                )}

                                <div className="flex items-center gap-3 mt-1.5">
                                    <span className="text-[10px] text-muted-foreground">
                                        {formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                        {formatDuration(log.duration_ms)}
                                    </span>
                                </div>
                            </div>

                            <ChevronDown className="w-4 h-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                        </div>
                    ))}

                    {hasMore && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => setOffset((o) => o + PAGE_SIZE)}
                            disabled={isFetching}
                        >
                            Load more
                        </Button>
                    )}
                </div>
            )}

            {/* Expanded log modal */}
            <Dialog open={!!expandedLog} onOpenChange={(open) => { if (!open) setExpandedLog(null) }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {expandedLog && <StatusIcon status={expandedLog.status} />}
                            Execution Details
                        </DialogTitle>
                    </DialogHeader>
                    {expandedLog && (
                        <div className="space-y-3 text-sm">
                            <div className="flex gap-2 flex-wrap">
                                <Badge
                                    variant="outline"
                                    className={cn('text-xs', triggerBadgeClass(expandedLog.trigger_type))}
                                >
                                    {expandedLog.trigger_type}
                                </Badge>
                                <Badge
                                    variant="outline"
                                    className={cn('text-xs', statusBadgeClass(expandedLog.status))}
                                >
                                    {expandedLog.status}
                                </Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                <div>
                                    <p className="font-medium text-foreground">Started</p>
                                    <p>{format(new Date(expandedLog.started_at), 'PPpp')}</p>
                                </div>
                                {expandedLog.completed_at && (
                                    <div>
                                        <p className="font-medium text-foreground">Completed</p>
                                        <p>{format(new Date(expandedLog.completed_at), 'PPpp')}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="font-medium text-foreground">Duration</p>
                                    <p>{formatDuration(expandedLog.duration_ms)}</p>
                                </div>
                            </div>

                            {expandedLog.summary && (
                                <div>
                                    <p className="font-medium text-xs mb-1">Summary</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed bg-accent/30 rounded p-2">
                                        {expandedLog.summary}
                                    </p>
                                </div>
                            )}

                            {expandedLog.error_details && (
                                <div>
                                    <p className="font-medium text-xs mb-1 text-destructive">Error</p>
                                    <p className="text-xs text-destructive bg-destructive/10 rounded p-2 font-mono break-all">
                                        {expandedLog.error_details}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
