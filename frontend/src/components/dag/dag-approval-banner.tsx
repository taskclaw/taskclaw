'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { approveDag, rejectDag, type TaskDag } from '@/app/dashboard/pods/actions'

interface DagApprovalBannerProps {
    dag: TaskDag
    onAction: () => void
}

export function DagApprovalBanner({ dag, onAction }: DagApprovalBannerProps) {
    const [expanded, setExpanded] = useState(false)
    const [rejectOpen, setRejectOpen] = useState(false)
    const [notes, setNotes] = useState('')
    const [approving, setApproving] = useState(false)
    const [rejecting, setRejecting] = useState(false)

    const taskCount = dag.tasks?.length ?? 0

    async function handleApprove() {
        setApproving(true)
        try {
            const result = await approveDag(dag.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('DAG approved — execution started')
                onAction()
            }
        } finally {
            setApproving(false)
        }
    }

    async function handleReject() {
        setRejecting(true)
        try {
            const result = await rejectDag(dag.id, notes || undefined)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('DAG rejected')
                setRejectOpen(false)
                setNotes('')
                onAction()
            }
        } finally {
            setRejecting(false)
        }
    }

    return (
        <div className="bg-yellow-50 dark:bg-yellow-500/10 border-b border-yellow-200 dark:border-yellow-500/20 p-3">
            {/* Banner header */}
            <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300">
                        Approval required
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                        AI planned {taskCount} task{taskCount !== 1 ? 's' : ''} to achieve this goal.
                        Review and approve to begin execution.
                    </p>

                    {/* Expandable task list */}
                    {taskCount > 0 && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="flex items-center gap-1 text-xs text-yellow-700 dark:text-yellow-400 mt-1.5 hover:underline"
                        >
                            {expanded ? (
                                <ChevronDown className="w-3 h-3" />
                            ) : (
                                <ChevronRight className="w-3 h-3" />
                            )}
                            {expanded ? 'Hide' : 'Show'} tasks
                        </button>
                    )}

                    {expanded && dag.tasks && (
                        <ul className="mt-2 space-y-1">
                            {dag.tasks.map((task) => (
                                <li
                                    key={task.id}
                                    className="flex items-center gap-1.5 text-xs text-yellow-800 dark:text-yellow-300"
                                >
                                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
                                    {task.title}
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Reject notes */}
                    {rejectOpen && (
                        <div className="mt-2 space-y-1.5">
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Reason for rejection (optional)..."
                                className="text-xs min-h-[60px] resize-none bg-white dark:bg-background border-yellow-300 dark:border-yellow-600"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3 pl-6">
                <Button
                    size="sm"
                    className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleApprove}
                    disabled={approving || rejecting}
                >
                    {approving ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                    ) : (
                        <CheckCircle className="w-3 h-3 mr-1.5" />
                    )}
                    Approve
                </Button>

                {rejectOpen ? (
                    <>
                        <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs"
                            onClick={handleReject}
                            disabled={rejecting || approving}
                        >
                            {rejecting ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                            ) : (
                                <XCircle className="w-3 h-3 mr-1.5" />
                            )}
                            Confirm reject
                        </Button>
                        <button
                            onClick={() => { setRejectOpen(false); setNotes('') }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => setRejectOpen(true)}
                        disabled={approving}
                    >
                        <XCircle className="w-3 h-3 mr-1.5" />
                        Reject
                    </Button>
                )}
            </div>
        </div>
    )
}
