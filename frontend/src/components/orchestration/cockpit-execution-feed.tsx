'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    CheckCircle2, XCircle, Clock, Play, ChevronDown, ChevronRight,
    Loader2, RefreshCw, ThumbsUp, X, ExternalLink, Activity,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { approveOrchestration, rejectOrchestration, getOrchestrationDetail } from '@/app/dashboard/pods/actions'
import { toast } from 'sonner'
import { useTaskStore } from '@/hooks/use-task-store'

// ── Types ──────────────────────────────────────────────────────────────────

export interface DelegationMeta {
    orchestration_id: string
    pod_id: string
    pod_slug?: string
    pod_name?: string
    goal: string
    status: string
}

interface OrchTask {
    id: string
    goal: string
    status: string
    pod_name?: string
    task_id?: string   // linked regular task id (if any)
    depends_on_titles?: string[]
}

interface OrchDetail {
    id: string
    goal: string
    status: string
    tasks: OrchTask[]
    pods?: { name?: string; slug?: string }
    boardTasks?: BoardTask[]
}

function getAccountId(): string | null {
    if (typeof document === 'undefined') return null
    const m = document.cookie.match(/current_account_id=([^;]+)/)
    return m ? m[1] : null
}

// ── Status helpers ─────────────────────────────────────────────────────────

const STATUS_ICON: Record<string, React.ReactNode> = {
    pending_approval: <Clock className="w-3 h-3 text-yellow-400" />,
    pending: <Clock className="w-3 h-3 text-slate-400" />,
    running: <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />,
    completed: <CheckCircle2 className="w-3 h-3 text-green-400" />,
    failed: <XCircle className="w-3 h-3 text-red-400" />,
    cancelled: <XCircle className="w-3 h-3 text-slate-500" />,
}

const STATUS_DOT: Record<string, string> = {
    pending_approval: 'bg-yellow-400',
    pending: 'bg-slate-400',
    running: 'bg-blue-400 animate-pulse',
    completed: 'bg-green-400',
    failed: 'bg-red-400',
    cancelled: 'bg-slate-500',
}

const STATUS_LABEL: Record<string, string> = {
    pending_approval: 'Needs approval',
    pending: 'Queued',
    running: 'Running',
    completed: 'Done',
    failed: 'Failed',
    cancelled: 'Cancelled',
}

// ── Single orchestration card ───────────────────────────────────────────────

interface BoardTask {
    id: string
    title: string
    status: string
    priority?: string
}

function OrchCard({ meta, accountId, onStatusChange, liveStatus }: { meta: DelegationMeta; accountId: string; onStatusChange?: (id: string, status: string) => void; liveStatus?: string }) {
    const [detail, setDetail] = useState<OrchDetail | null>(null)
    const [boardTasks, setBoardTasks] = useState<BoardTask[]>([])
    const [expanded, setExpanded] = useState(false)
    const [approving, setApproving] = useState(false)
    const [rejecting, setRejecting] = useState(false)
    // Use liveStatus from Realtime when available, fall back to meta.status
    const [status, setStatus] = useState(liveStatus ?? meta.status)
    const setSelectedTaskId = useTaskStore((s) => s.setSelectedTaskId)

    // Sync status when liveStatus changes from parent (Realtime)
    useEffect(() => {
        if (liveStatus !== undefined) {
            setStatus(liveStatus)
            onStatusChange?.(meta.orchestration_id, liveStatus)
        }
    }, [liveStatus, meta.orchestration_id, onStatusChange])

    const fetchDetail = useCallback(async () => {
        try {
            const result = await getOrchestrationDetail(meta.orchestration_id)
            if (result.error || !result.data) return
            // API returns { orchestration, tasks, deps, boardTasks } — map to OrchDetail shape
            const raw = result.data
            const fetchedStatus: string | undefined = raw.orchestration?.status ?? raw.status
            const data: OrchDetail = {
                id: raw.orchestration?.id ?? raw.id ?? meta.orchestration_id,
                goal: raw.orchestration?.goal ?? raw.goal ?? meta.goal,
                status: fetchedStatus ?? meta.status,
                tasks: raw.tasks ?? [],
                pods: raw.orchestration?.pods ?? raw.pods,
                boardTasks: raw.boardTasks,
            }
            setDetail(data)
            if (data.boardTasks) {
                setBoardTasks(data.boardTasks)
            }
            // Only update status from fetch if no liveStatus is provided, and we got a real status
            if (liveStatus === undefined && fetchedStatus) {
                setStatus(fetchedStatus)
                onStatusChange?.(meta.orchestration_id, fetchedStatus)
            }
        } catch { /* silent */ }
    }, [meta.orchestration_id, meta.goal, onStatusChange, liveStatus])

    // Fetch detail once on mount to populate task list
    useEffect(() => {
        fetchDetail()
    }, [fetchDetail])

    // Poll every 5s while running to get live board task cards
    useEffect(() => {
        if (status !== 'running') return
        const interval = setInterval(fetchDetail, 5000)
        return () => clearInterval(interval)
    }, [status, fetchDetail])

    const handleApprove = async () => {
        setApproving(true)
        const r = await approveOrchestration(meta.orchestration_id)
        setApproving(false)
        if (r.error) { toast.error(r.error); return }
        setStatus('running')
        onStatusChange?.(meta.orchestration_id, 'running')
        toast.success('Orchestration approved — running!')
        fetchDetail()
    }

    const handleReject = async () => {
        setRejecting(true)
        const r = await rejectOrchestration(meta.orchestration_id)
        setRejecting(false)
        if (r.error) { toast.error(r.error); return }
        setStatus('cancelled')
        onStatusChange?.(meta.orchestration_id, 'cancelled')
        toast.info('Orchestration cancelled')
        fetchDetail()
    }

    const podName = detail?.pods?.name ?? meta.pod_name ?? meta.pod_slug ?? 'Pod'
    const podSlug = detail?.pods?.slug ?? meta.pod_slug
    const allTasks = detail?.tasks ?? []
    // Filter out child tasks whose goal is identical to the parent (1:1 delegation — they add no info)
    const tasks = allTasks.filter(t => t.goal.trim() !== meta.goal.trim())

    return (
        <div className={cn(
            'rounded-xl border overflow-hidden transition-all',
            status === 'pending_approval' && 'border-yellow-500/30 bg-yellow-500/5',
            status === 'running' && 'border-blue-500/20 bg-blue-500/5',
            status === 'completed' && 'border-green-500/20 bg-green-500/5',
            status === 'failed' && 'border-red-500/20 bg-red-500/5',
            (status === 'cancelled' || status === 'pending') && 'border-white/10 bg-white/[0.02]',
        )}>
            {/* Header */}
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
            >
                <div className="mt-0.5 shrink-0">
                    {STATUS_ICON[status] ?? STATUS_ICON.pending}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                            {podName}
                        </span>
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{
                                background: status === 'pending_approval' ? 'rgba(255,209,111,0.15)' :
                                    status === 'running' ? 'rgba(96,165,250,0.15)' :
                                    status === 'completed' ? 'rgba(74,222,128,0.15)' :
                                    status === 'failed' ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.08)',
                                color: status === 'pending_approval' ? '#fcd34d' :
                                    status === 'running' ? '#60a5fa' :
                                    status === 'completed' ? '#4ade80' :
                                    status === 'failed' ? '#f87171' : 'rgba(255,255,255,0.4)',
                            }}>
                            {STATUS_LABEL[status] ?? status}
                        </span>
                    </div>
                    <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {meta.goal}
                    </p>
                </div>
                <div className="shrink-0 mt-0.5">
                    {expanded
                        ? <ChevronDown className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
                        : <ChevronRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
                    }
                </div>
            </button>

            {/* Approval bar */}
            {status === 'pending_approval' && (
                <div className="px-3 pb-2.5 flex items-center gap-2">
                    <button
                        onClick={handleApprove}
                        disabled={approving}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                        style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}
                    >
                        {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                        Approve
                    </button>
                    <button
                        onClick={handleReject}
                        disabled={rejecting}
                        className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
                        style={{ background: 'rgba(248,113,113,0.1)', color: 'rgba(248,113,113,0.7)', border: '1px solid rgba(248,113,113,0.2)' }}
                    >
                        {rejecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        Cancel
                    </button>
                    {podSlug && (
                        <Link href={`/dashboard/pods/${podSlug}?tab=goals`}
                            className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                            style={{ color: 'rgba(143,245,255,0.6)' }} title="View pod">
                            <ExternalLink className="w-3 h-3" />
                        </Link>
                    )}
                </div>
            )}

            {/* Board task cards — polled every 5s while running */}
            {boardTasks.length > 0 && (
                <div className="border-t divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
                        <span className="text-[9px] font-bold tracking-[0.15em] uppercase"
                            style={{ color: 'rgba(143,245,255,0.4)' }}>
                            Tasks created
                        </span>
                        <span className="text-[9px] px-1 py-0.5 rounded-full font-semibold"
                            style={{ background: 'rgba(143,245,255,0.1)', color: 'rgba(143,245,255,0.7)' }}>
                            {boardTasks.length}
                        </span>
                    </div>
                    {boardTasks.map((t) => (
                        <div key={t.id}
                            className="px-3 py-2 flex items-start gap-2 group hover:bg-white/[0.03] transition-colors cursor-pointer"
                            onClick={() => setSelectedTaskId(t.id)}
                        >
                            <div className="mt-0.5 shrink-0">
                                {STATUS_ICON[t.status] ?? STATUS_ICON.pending}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] leading-snug font-medium"
                                    style={{ color: 'rgba(255,255,255,0.8)' }}>
                                    {t.title}
                                </p>
                                <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    {t.priority} · {t.status}
                                </span>
                            </div>
                            <span className="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded shrink-0 transition-opacity"
                                style={{ background: 'rgba(143,245,255,0.1)', color: 'rgba(143,245,255,0.7)' }}>
                                Open
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Expanded task list */}
            {expanded && (
                <div className="border-t divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {allTasks.length === 0 && (
                        <div className="px-3 py-3 text-center">
                            <Loader2 className="w-3 h-3 animate-spin mx-auto" style={{ color: 'rgba(255,255,255,0.3)' }} />
                        </div>
                    )}
                    {allTasks.length > 0 && tasks.length === 0 && (
                        <div className="px-3 py-2.5">
                            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                {podName} will decompose this goal into board tasks when execution begins.
                            </p>
                        </div>
                    )}
                    {tasks.map((task) => (
                        <div key={task.id} className="px-3 py-2 flex items-start gap-2 group hover:bg-white/[0.03] transition-colors">
                            <div className="mt-0.5 shrink-0">
                                {STATUS_ICON[task.status] ?? STATUS_ICON.pending}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] leading-snug" style={{ color: 'rgba(255,255,255,0.75)' }}>
                                    {task.goal}
                                </p>
                                {task.pod_name && (
                                    <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                        {task.pod_name}
                                    </span>
                                )}
                                {task.depends_on_titles && task.depends_on_titles.length > 0 && (
                                    <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                        after: {task.depends_on_titles.join(', ')}
                                    </p>
                                )}
                            </div>
                            {/* If there's a linked task_id, show open button */}
                            {task.task_id && (
                                <button
                                    onClick={() => setSelectedTaskId(task.task_id!)}
                                    className="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded shrink-0 transition-opacity"
                                    style={{ background: 'rgba(143,245,255,0.1)', color: 'rgba(143,245,255,0.7)' }}
                                >
                                    Open
                                </button>
                            )}
                        </div>
                    ))}

                    {/* Footer: view in pod */}
                    {podSlug && (
                        <div className="px-3 py-2">
                            <Link href={`/dashboard/pods/${podSlug}?tab=goals`}
                                className="flex items-center gap-1.5 text-[10px] hover:underline"
                                style={{ color: 'rgba(143,245,255,0.5)' }}>
                                <ExternalLink className="w-3 h-3" />
                                View in {podName}
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Main feed component ─────────────────────────────────────────────────────

interface CockpitExecutionFeedProps {
    /** Delegations from the current conversation's messages */
    delegations: DelegationMeta[]
    /** Live statuses from Realtime subscription, keyed by orchestration_id */
    liveStatuses?: Record<string, string>
}

export function CockpitExecutionFeed({ delegations, liveStatuses = {} }: CockpitExecutionFeedProps) {
    const [accountId, setAccountId] = useState<string | null>(null)
    // Track live statuses reported by OrchCard children (overrides stale metadata)
    const [localLiveStatuses, setLocalLiveStatuses] = useState<Record<string, string>>({})

    useEffect(() => {
        setAccountId(getAccountId())
    }, [])

    const onStatusChange = useCallback((id: string, status: string) => {
        setLocalLiveStatuses(prev => prev[id] === status ? prev : { ...prev, [id]: status })
    }, [])

    if (!accountId || delegations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-12 gap-3">
                <Activity className="w-8 h-8" style={{ color: 'rgba(143,245,255,0.15)' }} />
                <p className="text-[11px] text-center" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    No active executions.<br />Delegate tasks to see them here.
                </p>
            </div>
        )
    }

    // Merge external liveStatuses with local ones (external Realtime takes priority)
    const mergedStatuses = { ...localLiveStatuses, ...liveStatuses }

    const pendingApproval = delegations.filter(d => {
        const live = mergedStatuses[d.orchestration_id]
        return (live ?? d.status) === 'pending_approval'
    }).length

    return (
        <div className="flex flex-col gap-2 p-2">
            {pendingApproval > 0 && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium"
                    style={{ background: 'rgba(255,209,111,0.08)', border: '1px solid rgba(255,209,111,0.2)', color: '#fcd34d' }}>
                    <Clock className="w-3 h-3 shrink-0" />
                    {pendingApproval} orchestration{pendingApproval !== 1 ? 's' : ''} awaiting your approval
                </div>
            )}
            {delegations.map((d) => (
                <OrchCard
                    key={d.orchestration_id}
                    meta={d}
                    accountId={accountId}
                    onStatusChange={onStatusChange}
                    liveStatus={mergedStatuses[d.orchestration_id]}
                />
            ))}
        </div>
    )
}
