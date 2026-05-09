'use client'

import { useEffect, useState, useRef } from 'react'
import {
    X,
    ExternalLink,
    CheckCircle2,
    Calendar,
    Zap,
    Bot,
    Loader2,
    MessageCircle,
    Pencil,
    Coins,
    AlertCircle,
    Trash2,
    ChevronDown,
    ChevronRight,
    AlertTriangle,
    CheckCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTaskStore } from '@/hooks/use-task-store'
import { useTaskDetail, useTaskContent, useTaskComments, useTaskUsage, useUpdateTask, useCompleteTask, useDeleteTask, useMoveTask } from '@/hooks/use-tasks'
import { useBackboneConnections } from '@/hooks/use-backbone-connections'
import { useMoveTaskToStep } from '@/hooks/use-boards'
import { usePomodoroStore } from '@/hooks/use-pomodoro'
import { PRIORITY_COLORS, STATUS_COLORS, KANBAN_COLUMNS } from '@/types/task'
import type { Category } from '@/types/task'
import type { BoardStep } from '@/types/board'
import { cn } from '@/lib/utils'
import { TaskAIChat } from './task-ai-chat'
import { resolveTaskBlocker } from '@/app/dashboard/tasks/actions'
import { MarkdownEditor } from './markdown-editor'
import { BackbonePicker } from '@/components/backbones/backbone-picker'
import { SchemaFieldRenderer } from '@/components/boards/schema-field-renderer'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface TaskDetailPanelProps {
    categories?: Category[]
    boardSteps?: BoardStep[]
}

export function TaskDetailPanel({ categories = [], boardSteps }: TaskDetailPanelProps) {
    const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
    const setSelectedTaskId = useTaskStore((s) => s.setSelectedTaskId)
    const { data: task, isLoading } = useTaskDetail(selectedTaskId)
    const { data: pageContent, isLoading: isContentLoading } = useTaskContent(selectedTaskId)
    const { data: comments, isLoading: isCommentsLoading } = useTaskComments(selectedTaskId)
    const { data: taskUsage } = useTaskUsage(selectedTaskId)
    const { data: backboneConnections } = useBackboneConnections()
    const updateTask = useUpdateTask()
    const completeTask = useCompleteTask()
    const deleteTask = useDeleteTask()
    const moveTask = useMoveTask()
    const moveTaskToStep = useMoveTaskToStep()
    const pomodoroStore = usePomodoroStore()

    const [editingTitle, setEditingTitle] = useState(false)
    const [titleValue, setTitleValue] = useState('')
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [taskBackboneId, setTaskBackboneId] = useState<string | null>(null)
    const titleInputRef = useRef<HTMLInputElement>(null)

    const aiConfigured = (backboneConnections ?? []).some(c => c.is_active)

    // Reset state when switching tasks
    useEffect(() => {
        setEditingTitle(false)
        setShowDeleteDialog(false)
        setTaskBackboneId(task?.backbone_connection_id ?? null)
    }, [selectedTaskId])

    // Sync task backbone from loaded task data
    useEffect(() => {
        if (task) setTaskBackboneId(task.backbone_connection_id ?? null)
    }, [task?.backbone_connection_id])

    // Sync title with task data
    useEffect(() => {
        if (task?.title) setTitleValue(task.title)
    }, [task?.title])

    // Focus input when entering edit mode
    useEffect(() => {
        if (editingTitle && titleInputRef.current) {
            titleInputRef.current.focus()
            titleInputRef.current.select()
        }
    }, [editingTitle])

    if (!selectedTaskId) return null

    const handleComplete = () => {
        completeTask.mutate(selectedTaskId)
        setSelectedTaskId(null)
    }

    const handleStartPomodoro = () => {
        if (!task) return
        try { new Audio('/sounds/start.wav').play().catch(() => {}) } catch {}
        pomodoroStore.setActiveTask(task.id, task.title)
        pomodoroStore.setMode('focus')
        pomodoroStore.setRunning(true)
        setSelectedTaskId(null)
    }

    const saveTitle = () => {
        const trimmed = titleValue.trim()
        if (!selectedTaskId || !trimmed || trimmed === task?.title) {
            setTitleValue(task?.title || '')
            setEditingTitle(false)
            return
        }
        updateTask.mutate(
            { id: selectedTaskId, title: trimmed },
            { onSettled: () => setEditingTitle(false) },
        )
    }

    const handleSaveNotes = (notes: string) => {
        if (!selectedTaskId) return
        updateTask.mutate({ id: selectedTaskId, notes })
    }

    const handleStatusChange = (status: string, stepId?: string) => {
        if (!selectedTaskId || status === task?.status) return
        if (stepId && boardSteps) {
            moveTaskToStep.mutate({ taskId: selectedTaskId, stepId, stepName: status })
        } else {
            moveTask.mutate({ id: selectedTaskId, status })
        }
    }

    const handleCategoryChange = (categoryId: string | null) => {
        if (!selectedTaskId) return
        updateTask.mutate({ id: selectedTaskId, category_id: categoryId || '' })
    }

    const handleAgentOverride = (categoryId: string | null) => {
        if (!selectedTaskId) return
        updateTask.mutate({ id: selectedTaskId, override_category_id: categoryId } as any)
    }

    const handleBackboneChange = (backboneId: string | null) => {
        if (!selectedTaskId) return
        setTaskBackboneId(backboneId)
        updateTask.mutate({ id: selectedTaskId, backbone_connection_id: backboneId } as any)
    }

    const handleDelete = () => {
        if (!selectedTaskId) return
        deleteTask.mutate(selectedTaskId, {
            onSuccess: () => {
                toast.success('Task deleted')
                setSelectedTaskId(null)
            },
            onError: () => {
                toast.error('Failed to delete task')
            },
        })
        setShowDeleteDialog(false)
    }

    const handleCardDataChange = (stepKey: string, fieldKey: string, value: any) => {
        if (!selectedTaskId || !task) return
        const existingStepData = task.card_data?.[stepKey] || {}
        const updatedStepData = { ...existingStepData, [fieldKey]: value }
        updateTask.mutate({ id: selectedTaskId, card_data: { [stepKey]: updatedStepData } })
    }

    // Resolve category
    const category = categories.find((c) => c.id === task?.category_id)
    const categoryColor = category?.color || '#71717a'
    const categoryName = category?.name || task?.category || 'None'

    const priorityColor = task?.priority
        ? PRIORITY_COLORS[task.priority]
        : '#71717a'
    const currentBoardStep = boardSteps?.find((s) => s.name === task?.status || s.id === task?.current_step_id)
    const currentStepSchema = currentBoardStep?.input_schema || []
    const currentStepKey = currentBoardStep?.step_key
    const taskCardData = task?.card_data || {}
    const currentStepData = currentStepKey ? (taskCardData[currentStepKey] || {}) : {}
    const statusColor = currentBoardStep?.color
        || (task?.status ? STATUS_COLORS[task.status] : '#71717a')
        || '#71717a'

    // Is this a manually created task (no external source)?
    const isManualTask = !task?.source_id
    const sourceProvider = task?.sources?.provider

    return (
        <>
            {/* Backdrop overlay */}
            <div
                className="fixed inset-0 bg-black/40 z-40"
                onClick={() => setSelectedTaskId(null)}
            />
            <aside
                className="fixed top-0 right-0 h-full w-[60vw] max-w-[1200px] min-w-[600px] flex flex-col bg-card border-l border-border z-50 shadow-2xl"
                style={{ animation: 'slideInRight 0.2s ease-out' }}
            >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border sticky top-0 z-10 bg-card/90 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-accent/50 rounded border border-border">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Task
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowDeleteDialog(true)}
                        className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete task"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setSelectedTaskId(null)}
                        className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {isLoading || !task ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                    Loading...
                </div>
            ) : (
                <div className="flex-1 flex min-h-0">
                    {/* ═══ LEFT COLUMN: Task Info ═══ */}
                    <div className="flex-1 flex flex-col min-w-0 border-r border-border">
                        <div className="flex-1 overflow-y-auto min-h-0">
                            {/* Title (click to edit) */}
                            <div className="px-6 pt-5 pb-2 group/title">
                                {editingTitle ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            ref={titleInputRef}
                                            value={titleValue}
                                            onChange={(e) => setTitleValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') saveTitle()
                                                if (e.key === 'Escape') {
                                                    setTitleValue(task.title)
                                                    setEditingTitle(false)
                                                }
                                            }}
                                            onBlur={saveTitle}
                                            className="flex-1 text-lg font-bold leading-tight bg-accent/50 border border-primary/30 rounded-lg px-3 py-1.5 outline-none"
                                        />
                                    </div>
                                ) : (
                                    <h2
                                        onClick={() => setEditingTitle(true)}
                                        className="text-lg font-bold leading-tight cursor-pointer hover:text-primary/80 transition-colors flex items-center gap-2"
                                    >
                                        {task.title}
                                        <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/title:opacity-100 transition-opacity" />
                                    </h2>
                                )}
                            </div>

                            {/* Blocker banner */}
                            {task.status === 'blocked' && task.metadata?.blocker && (
                                <div className="mx-6 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-0.5">
                                                Blocked
                                            </p>
                                            <p className="text-xs text-amber-200/80 leading-snug">
                                                {(task.metadata.blocker as any).reason}
                                            </p>
                                            {(task.metadata.blocker as any).suggested_resolution && (
                                                <p className="text-[11px] text-amber-300/60 mt-1 leading-snug">
                                                    Suggestion: {(task.metadata.blocker as any).suggested_resolution}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={async () => {
                                                const result = await resolveTaskBlocker(task.id)
                                                if (result.error) toast.error(result.error)
                                                else toast.success('Blocker resolved — task is in progress')
                                            }}
                                            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold shrink-0 transition-colors"
                                            style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}
                                        >
                                            <CheckCheck className="w-3 h-3" />
                                            Resolve
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Metadata */}
                            <div className="px-6 py-3 grid grid-cols-2 gap-y-3 gap-x-6 border-b border-border">
                                {/* Status - clickable dropdown */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        Status
                                    </label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                className="flex items-center gap-2 w-fit px-2 py-1 rounded text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                                                style={{
                                                    color: statusColor,
                                                    backgroundColor: `${statusColor}20`,
                                                    border: `1px solid ${statusColor}30`,
                                                }}
                                            >
                                                <span
                                                    className="w-1.5 h-1.5 rounded-full"
                                                    style={{ backgroundColor: statusColor }}
                                                />
                                                {task.status || 'To-Do'}
                                                <ChevronDown className="w-3 h-3 opacity-60" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="min-w-[160px]">
                                            {boardSteps ? (
                                                boardSteps.map((step) => {
                                                    const stepColor = step.color || '#71717a'
                                                    return (
                                                        <DropdownMenuItem
                                                            key={step.id}
                                                            onClick={() => handleStatusChange(step.name, step.id)}
                                                            className={cn(
                                                                'flex items-center gap-2 text-xs cursor-pointer',
                                                                task.status === step.name && 'bg-accent',
                                                            )}
                                                        >
                                                            <span
                                                                className="w-2 h-2 rounded-full shrink-0"
                                                                style={{ backgroundColor: stepColor }}
                                                            />
                                                            {step.name}
                                                        </DropdownMenuItem>
                                                    )
                                                })
                                            ) : (
                                                KANBAN_COLUMNS.map((status) => {
                                                    const color = STATUS_COLORS[status] || '#71717a'
                                                    return (
                                                        <DropdownMenuItem
                                                            key={status}
                                                            onClick={() => handleStatusChange(status)}
                                                            className={cn(
                                                                'flex items-center gap-2 text-xs cursor-pointer',
                                                                task.status === status && 'bg-accent',
                                                            )}
                                                        >
                                                            <span
                                                                className="w-2 h-2 rounded-full shrink-0"
                                                                style={{ backgroundColor: color }}
                                                            />
                                                            {status}
                                                        </DropdownMenuItem>
                                                    )
                                                })
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        Due Date
                                    </label>
                                    <div className="flex items-center gap-2 text-xs font-medium">
                                        <Calendar className="w-3.5 h-3.5" />
                                        {task.due_date
                                            ? new Date(task.due_date).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })
                                            : 'No date'}
                                    </div>
                                </div>

                                {/* Agent - clickable dropdown */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        Agent
                                    </label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded font-bold uppercase cursor-pointer hover:opacity-80 transition-opacity"
                                                style={{
                                                    color: categoryColor,
                                                    backgroundColor: `${categoryColor}15`,
                                                }}
                                            >
                                                {categoryName}
                                                <ChevronDown className="w-3 h-3 opacity-60" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="min-w-[160px]">
                                            <DropdownMenuItem
                                                onClick={() => handleCategoryChange(null)}
                                                className={cn(
                                                    'flex items-center gap-2 text-xs cursor-pointer',
                                                    !task.category_id && 'bg-accent',
                                                )}
                                            >
                                                <span className="w-2 h-2 rounded-full shrink-0 bg-muted-foreground/40" />
                                                None
                                            </DropdownMenuItem>
                                            {categories.map((cat) => (
                                                <DropdownMenuItem
                                                    key={cat.id}
                                                    onClick={() => handleCategoryChange(cat.id)}
                                                    className={cn(
                                                        'flex items-center gap-2 text-xs cursor-pointer',
                                                        task.category_id === cat.id && 'bg-accent',
                                                    )}
                                                >
                                                    <span
                                                        className="w-2 h-2 rounded-full shrink-0"
                                                        style={{ backgroundColor: cat.color || '#71717a' }}
                                                    />
                                                    {cat.name}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        Priority
                                    </label>
                                    <div
                                        className="flex items-center gap-1 text-xs px-2 py-1 rounded w-fit"
                                        style={{
                                            color: priorityColor,
                                            backgroundColor: `${priorityColor}15`,
                                            border: `1px solid ${priorityColor}20`,
                                        }}
                                    >
                                        {task.priority || 'None'}
                                    </div>
                                </div>

                                {/* Agent Override */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        Agent
                                    </label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                className={cn(
                                                    'flex items-center gap-1.5 text-xs px-2 py-1 rounded w-fit cursor-pointer hover:opacity-80 transition-opacity',
                                                    task.override_category_id
                                                        ? 'bg-primary/10 text-primary border border-primary/20'
                                                        : 'bg-accent/50 text-muted-foreground border border-border',
                                                )}
                                            >
                                                <Bot className="w-3 h-3" />
                                                {task.override_category?.name || task.categories?.name || 'Auto'}
                                                {task.override_category_id && (
                                                    <span className="text-[9px] bg-primary/20 px-1 rounded">Card</span>
                                                )}
                                                <ChevronDown className="w-3 h-3 opacity-60" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="min-w-[180px]">
                                            <DropdownMenuItem
                                                onClick={() => handleAgentOverride(null)}
                                                className={cn(
                                                    'flex items-center gap-2 text-xs cursor-pointer',
                                                    !task.override_category_id && 'bg-accent',
                                                )}
                                            >
                                                <span className="w-2 h-2 rounded-full shrink-0 bg-muted-foreground/40" />
                                                Auto (inherit from column/board)
                                            </DropdownMenuItem>
                                            {categories.map((cat) => (
                                                <DropdownMenuItem
                                                    key={cat.id}
                                                    onClick={() => handleAgentOverride(cat.id)}
                                                    className={cn(
                                                        'flex items-center gap-2 text-xs cursor-pointer',
                                                        task.override_category_id === cat.id && 'bg-accent',
                                                    )}
                                                >
                                                    <span
                                                        className="w-2 h-2 rounded-full shrink-0"
                                                        style={{ backgroundColor: cat.color || '#71717a' }}
                                                    />
                                                    {cat.name}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                {/* Task-level backbone override */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        AI Backbone
                                    </label>
                                    <BackbonePicker
                                        value={taskBackboneId}
                                        onChange={handleBackboneChange}
                                        showInheritOption
                                        inheritLabel="Inherit (column → board → default)"
                                    />
                                </div>

                                {task.time_spent !== null && task.time_spent > 0 && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                            Time Spent
                                        </label>
                                        <span className="text-xs">
                                            {task.time_spent.toFixed(1)}h
                                        </span>
                                    </div>
                                )}

                                {taskUsage && taskUsage.tokens > 0 && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                            AI Usage
                                        </label>
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-muted-foreground">
                                                <Coins className="w-3 h-3 inline mr-1" />
                                                {taskUsage.tokens.toLocaleString()} tokens
                                            </span>
                                            {taskUsage.cost > 0 && (
                                                <span className="text-muted-foreground font-mono">
                                                    ~${taskUsage.cost < 0.01
                                                        ? taskUsage.cost.toFixed(4)
                                                        : taskUsage.cost.toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Card data fields — all steps with schemas or data */}
                            {boardSteps && boardSteps.filter((s) =>
                                (s.input_schema?.length > 0) || (s.output_schema?.length > 0) || taskCardData[s.step_key]
                            ).length > 0 && (
                                <div className="px-6 py-3 space-y-1 border-b border-border">
                                    {boardSteps
                                        .filter((s) => (s.input_schema?.length > 0) || (s.output_schema?.length > 0) || taskCardData[s.step_key])
                                        .map((s) => {
                                            const isCurrent = s.step_key === currentStepKey
                                            const stepData = taskCardData[s.step_key] || {}
                                            const hasInputSchema = s.input_schema?.length > 0
                                            const hasOutputSchema = s.output_schema?.length > 0
                                            const stepColor = s.color || '#71717a'
                                            const inputKeys = new Set(s.input_schema?.map((f) => f.key) || [])
                                            const outputKeys = new Set(s.output_schema?.map((f) => f.key) || [])

                                            return (
                                                <details
                                                    key={s.step_key}
                                                    open={isCurrent}
                                                    className="group"
                                                >
                                                    <summary className="cursor-pointer flex items-center gap-2 py-2.5 hover:bg-accent/30 -mx-2 px-2 rounded transition-colors">
                                                        <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-90" />
                                                        <span
                                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style={{ backgroundColor: stepColor }}
                                                        />
                                                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                                            {s.name}
                                                        </span>
                                                        {isCurrent && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                                                Current
                                                            </span>
                                                        )}
                                                    </summary>
                                                    <div className="ml-7 pb-4 pt-2 space-y-4">
                                                        {/* Input fields section */}
                                                        {(hasInputSchema || Object.keys(stepData).some((k) => inputKeys.has(k))) && (
                                                            <div className="space-y-2.5">
                                                                {(hasInputSchema && hasOutputSchema) && (
                                                                    <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Input</p>
                                                                )}
                                                                {isCurrent && hasInputSchema ? (
                                                                    s.input_schema.map((field) => (
                                                                        <SchemaFieldRenderer
                                                                            key={field.key}
                                                                            field={field}
                                                                            value={stepData[field.key]}
                                                                            onChange={(val) => handleCardDataChange(s.step_key, field.key, val)}
                                                                            compact
                                                                        />
                                                                    ))
                                                                ) : hasInputSchema ? (
                                                                    s.input_schema.map((field) => {
                                                                        const val = stepData[field.key]
                                                                        if (val === undefined || val === '') return null
                                                                        return (
                                                                            <div key={field.key} className="flex gap-2 text-sm">
                                                                                <span className="text-muted-foreground/60 shrink-0">{field.label}:</span>
                                                                                <span className="break-words">{String(val)}</span>
                                                                            </div>
                                                                        )
                                                                    })
                                                                ) : null}
                                                            </div>
                                                        )}

                                                        {/* Output fields section */}
                                                        {hasOutputSchema && (
                                                            <div className="space-y-2.5">
                                                                {(hasInputSchema && hasOutputSchema) && (
                                                                    <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest pt-2 border-t border-border/50">Output</p>
                                                                )}
                                                                {s.output_schema.map((field) => {
                                                                    const val = stepData[field.key]
                                                                    if (val === undefined || val === '') {
                                                                        return (
                                                                            <div key={field.key} className="flex gap-2 text-sm">
                                                                                <span className="text-muted-foreground/40 shrink-0">{field.label}:</span>
                                                                                <span className="text-muted-foreground/30 italic">pending</span>
                                                                            </div>
                                                                        )
                                                                    }
                                                                    return (
                                                                        <div key={field.key} className="flex gap-2 text-sm">
                                                                            <span className="text-muted-foreground/60 shrink-0">{field.label}:</span>
                                                                            <span className="break-words">{typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}</span>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* No data at all */}
                                                        {!hasInputSchema && !hasOutputSchema && Object.keys(stepData).length === 0 && (
                                                            <p className="text-xs text-muted-foreground/40 italic">
                                                                No data yet
                                                            </p>
                                                        )}

                                                        {/* Extra data not in schemas (legacy/manual) */}
                                                        {Object.entries(stepData)
                                                            .filter(([k]) => !inputKeys.has(k) && !outputKeys.has(k))
                                                            .map(([k, v]) => (
                                                                <div key={k} className="flex gap-2 text-sm">
                                                                    <span className="text-muted-foreground/60 shrink-0">{k}:</span>
                                                                    <span className="break-words">{String(v)}</span>
                                                                </div>
                                                            ))
                                                        }
                                                    </div>
                                                </details>
                                            )
                                        })}
                                </div>
                            )}

                            {/* Description — editable for all tasks, syncs to integration */}
                            <div className="px-6 py-4 space-y-2 border-b border-border">
                                <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                    Description
                                </h4>
                                {!isManualTask && isContentLoading ? (
                                    <div className="bg-accent/50 border border-border rounded-xl p-4 text-sm min-h-[80px] flex items-center justify-center text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                            Loading content...
                                        </div>
                                    </div>
                                ) : (
                                    <MarkdownEditor
                                        value={task.notes || (!isManualTask && pageContent ? pageContent : '') || ''}
                                        onSave={handleSaveNotes}
                                        placeholder="Click to add a description... (Markdown supported)"
                                    />
                                )}
                            </div>

                            {/* Comments (from Notion/ClickUp) */}
                            {task.source_id && (
                                <div className="px-6 py-4 space-y-2 border-b border-border">
                                    <div className="flex items-center gap-2">
                                        <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                            Comments
                                        </h4>
                                        {comments && comments.length > 0 && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground font-medium">
                                                {comments.length}
                                            </span>
                                        )}
                                    </div>

                                    {isCommentsLoading ? (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                            Loading comments...
                                        </div>
                                    ) : comments && comments.length > 0 ? (
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                            {comments.map((comment) => {
                                                const isUser = comment.text.startsWith('User: ')
                                                const isAI = comment.text.startsWith('AI: ')
                                                const displayText = isUser
                                                    ? comment.text.slice(6)
                                                    : isAI
                                                      ? comment.text.slice(4)
                                                      : comment.text

                                                return (
                                                    <div
                                                        key={comment.id}
                                                        className={cn(
                                                            'text-xs rounded-lg px-3 py-2 border',
                                                            isUser
                                                                ? 'bg-primary/10 border-primary/20'
                                                                : isAI
                                                                  ? 'bg-purple-500/10 border-purple-500/20'
                                                                  : 'bg-accent/50 border-border',
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className={cn(
                                                                'text-[10px] font-bold uppercase tracking-wider',
                                                                isUser ? 'text-primary' : isAI ? 'text-purple-400' : 'text-muted-foreground',
                                                            )}>
                                                                {isUser ? 'You' : isAI ? 'AI' : comment.author}
                                                            </span>
                                                            <span className="text-[9px] text-muted-foreground/60">
                                                                {new Date(comment.created_at).toLocaleDateString('en-US', {
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit',
                                                                })}
                                                            </span>
                                                        </div>
                                                        <div className="whitespace-pre-wrap break-words leading-relaxed">
                                                            {displayText}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground/50 italic py-2">
                                            No comments yet
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Left column footer — actions */}
                        <div className="p-4 bg-card border-t border-border">
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={handleStartPomodoro}
                                    className="flex items-center justify-center gap-2 py-2 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 text-[11px] font-bold rounded-lg transition-all text-orange-400"
                                >
                                    <Zap className="w-3.5 h-3.5" />
                                    POMODORO
                                </button>
                                <button
                                    onClick={() => {
                                        window.location.href = '/dashboard/chat'
                                    }}
                                    className="flex items-center justify-center gap-2 py-2 bg-accent/50 border border-border hover:bg-accent text-[11px] font-bold rounded-lg transition-all text-muted-foreground hover:text-foreground"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    FULL CHAT
                                </button>
                                <button
                                    onClick={handleComplete}
                                    className="flex items-center justify-center gap-2 py-2 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-[11px] font-bold rounded-lg transition-all text-emerald-400"
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    COMPLETE
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ═══ RIGHT COLUMN: AI Chat ═══ */}
                    <div className="w-[45%] min-w-[320px] flex flex-col min-h-0">
                        {aiConfigured ? (
                            <TaskAIChat
                                taskId={task.id}
                                taskTitle={task.title}
                                taskDescription={task.notes || null}
                                sourceProvider={task.sources?.provider || null}
                                onClose={() => {}}
                            />
                        ) : (
                            <div className="flex-1 flex items-center justify-center p-6">
                                <div className="text-center space-y-3">
                                    <Bot className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                                    <p className="text-sm text-muted-foreground">AI Assistant not configured</p>
                                    <a
                                        href="/dashboard/settings/backbones"
                                        className="text-xs text-primary underline"
                                    >
                                        Setup AI Backbone
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </aside>

        {/* Delete confirmation dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete task</AlertDialogTitle>
                    <AlertDialogDescription>
                        {isManualTask
                            ? 'This will permanently delete this task. This action cannot be undone.'
                            : `This will remove the task from TaskClaw. The original task in ${sourceProvider === 'clickup' ? 'ClickUp' : sourceProvider === 'notion' ? 'Notion' : 'the integration'} will not be deleted.`
                        }
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    )
}
