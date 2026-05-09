'use client'

import { useState, useCallback, useEffect } from 'react'
import { ChevronDown, ChevronRight, Loader2, ExternalLink, CheckCircle2, XCircle, Clock, ThumbsUp, X } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useTaskStore } from '@/hooks/use-task-store'
import type { ActiveOrchestration } from '@/hooks/use-live-execution'
import { getOrchestrationDetail, approveOrchestration, rejectOrchestration } from '@/app/dashboard/pods/actions'
import { toast } from 'sonner'

interface OrchTask {
    id: string
    goal: string
    status: string
    pod_name?: string
    task_id?: string
    depends_on_titles?: string[]
}

interface BoardTask {
    id: string
    title: string
    status: string
    priority?: string
}

interface OrchDetail {
    id: string
    goal: string
    status: string
    tasks: OrchTask[]
    pods?: { name?: string; slug?: string }
    boardTasks?: BoardTask[]
}

const STATUS_ICON: Record<string, React.ReactNode> = {
    pending_approval: <Clock className="w-3 h-3 text-yellow-400" />,
    pending: <Clock className="w-3 h-3 text-slate-400" />,
    running: <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />,
    completed: <CheckCircle2 className="w-3 h-3 text-green-400" />,
    failed: <XCircle className="w-3 h-3 text-red-400" />,
    cancelled: <XCircle className="w-3 h-3 text-slate-500" />,
}

const STATUS_LABEL: Record<string, string> = {
    pending_approval: 'Needs approval',
    pending: 'Queued',
    running: 'Running',
    completed: 'Done',
    failed: 'Failed',
    cancelled: 'Cancelled',
}

interface OrchestrationGroupProps {
    orchestration: ActiveOrchestration
    liveStatus?: string
}

export function OrchestrationGroup({ orchestration, liveStatus }: OrchestrationGroupProps) {
    const [expanded, setExpanded] = useState(false)
    const [detail, setDetail] = useState<OrchDetail | null>(null)
    const [boardTasks, setBoardTasks] = useState<BoardTask[]>([])
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [localStatus, setLocalStatus] = useState(liveStatus ?? orchestration.status)
    const [approving, setApproving] = useState(false)
    const [rejecting, setRejecting] = useState(false)
    const setSelectedTaskId = useTaskStore((s) => s.setSelectedTaskId)

    const status = liveStatus ?? localStatus
    const podName = detail?.pods?.name ?? orchestration.pod_name ?? orchestration.pod_slug ?? 'Pod'
    const podSlug = detail?.pods?.slug ?? orchestration.pod_slug
    const allTasks = detail?.tasks ?? []
    // Filter out child tasks whose goal is identical to the parent (1:1 delegation — they add no info)
    const tasks = allTasks.filter(t => t.goal.trim() !== orchestration.goal.trim())

    const fetchDetail = useCallback(async () => {
        if (loadingDetail) return
        setLoadingDetail(true)
        try {
            const result = await getOrchestrationDetail(orchestration.id)
            if (!result.error && result.data) {
                // API returns { orchestration, tasks, deps, boardTasks } — map to OrchDetail shape
                const raw = result.data
                const fetchedStatus: string | undefined = raw.orchestration?.status ?? raw.status
                const mapped: OrchDetail = {
                    id: raw.orchestration?.id ?? raw.id ?? orchestration.id,
                    goal: raw.orchestration?.goal ?? raw.goal ?? orchestration.goal,
                    status: fetchedStatus ?? orchestration.status,
                    tasks: raw.tasks ?? [],
                    pods: raw.orchestration?.pods ?? raw.pods,
                    boardTasks: raw.boardTasks,
                }
                setDetail(mapped)
                if (mapped.boardTasks) setBoardTasks(mapped.boardTasks)
                // Update localStatus from fetch if liveStatus not provided and we got a real status
                if (liveStatus === undefined && fetchedStatus) {
                    setLocalStatus(fetchedStatus)
                }
            }
        } catch { /* silent */ }
        finally { setLoadingDetail(false) }
    }, [orchestration.id, orchestration.goal, orchestration.status, loadingDetail, liveStatus])

    // Poll every 5s while running to get live board task cards
    useEffect(() => {
        if (status !== 'running') return
        const interval = setInterval(() => {
            fetchDetail()
        }, 5000)
        return () => clearInterval(interval)
    }, [status, fetchDetail])

    // Auto-fetch detail on mount for pending_approval so user can see what they're approving
    useEffect(() => {
        if (status === 'pending_approval' && !detail) {
            fetchDetail()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Fetch detail when expanded
    useEffect(() => {
        if (expanded && !detail) {
            fetchDetail()
        }
    }, [expanded, detail, fetchDetail])

    const handleApprove = async () => {
        setApproving(true)
        const r = await approveOrchestration(orchestration.id)
        setApproving(false)
        if (r.error) { toast.error(r.error); return }
        setLocalStatus('running')
        toast.success('Orchestration approved — running!')
        fetchDetail()
    }

    const handleReject = async () => {
        setRejecting(true)
        const r = await rejectOrchestration(orchestration.id)
        setRejecting(false)
        if (r.error) { toast.error(r.error); return }
        setLocalStatus('cancelled')
        toast.info('Orchestration cancelled')
    }

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
                        {orchestration.goal}
                    </p>
                </div>
                <div className="shrink-0 mt-0.5">
                    {expanded
                        ? <ChevronDown className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
                        : <ChevronRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
                    }
                </div>
            </button>

            {/* Approval bar — shown inline when pending_approval */}
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
                    {loadingDetail && allTasks.length === 0 && (
                        <div className="px-3 py-3 text-center">
                            <Loader2 className="w-3 h-3 animate-spin mx-auto" style={{ color: 'rgba(255,255,255,0.3)' }} />
                        </div>
                    )}

                    {/* When all tasks are identical to parent goal, show informational note */}
                    {!loadingDetail && allTasks.length > 0 && tasks.length === 0 && (
                        <div className="px-3 py-2.5">
                            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                {podName} will decompose this goal into board tasks when execution begins.
                            </p>
                        </div>
                    )}

                    {tasks.map((task) => (
                        <div
                            key={task.id}
                            className="px-3 py-2 flex items-start gap-2 group hover:bg-white/[0.03] transition-colors"
                        >
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
