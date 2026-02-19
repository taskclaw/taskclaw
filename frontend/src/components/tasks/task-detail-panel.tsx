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
} from 'lucide-react'
import { toast } from 'sonner'
import { useTaskStore } from '@/hooks/use-task-store'
import { useTaskDetail, useTaskContent, useTaskComments, useTaskUsage, useUpdateTask, useCompleteTask, useDeleteTask, useMoveTask, useAiProviderConfig } from '@/hooks/use-tasks'
import { usePomodoroStore } from '@/hooks/use-pomodoro'
import { PRIORITY_COLORS, STATUS_COLORS, KANBAN_COLUMNS } from '@/types/task'
import type { Category } from '@/types/task'
import { cn } from '@/lib/utils'
import { TaskAIChat } from './task-ai-chat'
import { MarkdownEditor } from './markdown-editor'
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
}

export function TaskDetailPanel({ categories = [] }: TaskDetailPanelProps) {
    const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
    const setSelectedTaskId = useTaskStore((s) => s.setSelectedTaskId)
    const { data: task, isLoading } = useTaskDetail(selectedTaskId)
    const { data: pageContent, isLoading: isContentLoading } = useTaskContent(selectedTaskId)
    const { data: comments, isLoading: isCommentsLoading } = useTaskComments(selectedTaskId)
    const { data: taskUsage } = useTaskUsage(selectedTaskId)
    const { data: aiConfig } = useAiProviderConfig()
    const updateTask = useUpdateTask()
    const completeTask = useCompleteTask()
    const deleteTask = useDeleteTask()
    const moveTask = useMoveTask()
    const pomodoroStore = usePomodoroStore()

    const [showAIChat, setShowAIChat] = useState(false)
    const [editingTitle, setEditingTitle] = useState(false)
    const [titleValue, setTitleValue] = useState('')
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const titleInputRef = useRef<HTMLInputElement>(null)

    const aiConfigured = !!aiConfig && !!aiConfig.api_url

    // Reset state when switching tasks
    useEffect(() => {
        setShowAIChat(false)
        setEditingTitle(false)
        setShowDeleteDialog(false)
    }, [selectedTaskId])

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

    const handleStatusChange = (status: string) => {
        if (!selectedTaskId || status === task?.status) return
        moveTask.mutate({ id: selectedTaskId, status })
    }

    const handleCategoryChange = (categoryId: string | null) => {
        if (!selectedTaskId) return
        updateTask.mutate({ id: selectedTaskId, category_id: categoryId || '' })
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

    // Resolve category
    const category = categories.find((c) => c.id === task?.category_id)
    const categoryColor = category?.color || '#71717a'
    const categoryName = category?.name || task?.category || 'None'

    const priorityColor = task?.priority
        ? PRIORITY_COLORS[task.priority]
        : '#71717a'
    const statusColor = task?.status
        ? STATUS_COLORS[task.status]
        : '#71717a'

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
                className="fixed top-0 right-0 h-full w-[440px] max-w-[90vw] flex flex-col bg-card border-l border-border z-50 shadow-2xl transition-transform duration-200 ease-out"
                style={{ animation: 'slideInRight 0.2s ease-out' }}
            >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 z-10 bg-card/90 backdrop-blur-sm">
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
                <>
                    {/* Content */}
                    <div className="flex-1 overflow-y-auto min-h-0">
                        {/* Title (click to edit) */}
                        <div className="px-8 pt-6 pb-2 group/title">
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
                                        className="flex-1 text-xl font-bold leading-tight bg-accent/50 border border-primary/30 rounded-lg px-3 py-1.5 outline-none"
                                    />
                                </div>
                            ) : (
                                <h2
                                    onClick={() => setEditingTitle(true)}
                                    className="text-xl font-bold leading-tight cursor-pointer hover:text-primary/80 transition-colors flex items-center gap-2"
                                >
                                    {task.title}
                                    <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/title:opacity-100 transition-opacity" />
                                </h2>
                            )}
                        </div>

                        {/* Metadata */}
                        <div className="px-8 py-4 grid grid-cols-2 gap-y-4 gap-x-8 border-b border-border">
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
                                        {KANBAN_COLUMNS.map((status) => {
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
                                        })}
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

                            {/* Category - clickable dropdown */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    Category
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
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <Coins className="w-3 h-3 text-amber-400" />
                                        <span className="font-medium">
                                            {taskUsage.tokens >= 1000
                                                ? `${(taskUsage.tokens / 1000).toFixed(1)}K`
                                                : taskUsage.tokens} tok
                                        </span>
                                        <span className="text-muted-foreground">
                                            ({taskUsage.messages} msg{taskUsage.messages !== 1 ? 's' : ''})
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

                        {/* Description — editable for all tasks, syncs to integration */}
                        <div className="px-8 py-6 space-y-3 border-b border-border">
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
                            <div className="px-8 py-6 space-y-3 border-t border-border">
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

                        {/* AI Chat Panel (inline, per-task) */}
                        {showAIChat && task && (
                            <div className="px-6 pb-4">
                                <TaskAIChat
                                    taskId={task.id}
                                    taskTitle={task.title}
                                    sourceProvider={task.sources?.provider || null}
                                    onClose={() => setShowAIChat(false)}
                                />
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="p-6 bg-card border-t border-border space-y-3">
                        {/* AI Assistant button */}
                        <div className="relative group/ai">
                            <button
                                onClick={() => aiConfigured && setShowAIChat(!showAIChat)}
                                disabled={!aiConfigured}
                                className={cn(
                                    'w-full py-3 font-bold rounded-xl flex items-center justify-center gap-3 shadow-xl transition-colors text-sm',
                                    !aiConfigured
                                        ? 'bg-accent text-muted-foreground border border-border shadow-none cursor-not-allowed opacity-60'
                                        : showAIChat
                                        ? 'bg-accent text-muted-foreground border border-border shadow-none hover:bg-accent/80'
                                        : 'bg-primary text-primary-foreground shadow-primary/20 hover:bg-primary/80',
                                )}
                            >
                                <Bot className="w-4 h-4" />
                                {showAIChat ? 'Hide AI Assistant' : 'Run AI Assistant'}
                            </button>

                            {/* Tooltip when disabled */}
                            {!aiConfigured && (
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover/ai:opacity-100 transition-opacity pointer-events-none z-10">
                                    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg flex items-center gap-2 whitespace-nowrap text-xs">
                                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <span>
                                            <a href="/dashboard/settings/ai-provider" className="text-primary underline pointer-events-auto">
                                                Setup OpenClaw
                                            </a>
                                            {' '}first to use AI
                                        </span>
                                    </div>
                                    <div className="w-2 h-2 bg-popover border-b border-r border-border rotate-45 mx-auto -mt-1" />
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <button
                                onClick={handleStartPomodoro}
                                className="flex items-center justify-center gap-2 py-2.5 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 text-[11px] font-bold rounded-lg transition-all text-orange-400"
                            >
                                <Zap className="w-3.5 h-3.5" />
                                POMODORO
                            </button>
                            <button
                                onClick={() => {
                                    window.location.href = '/dashboard/chat'
                                }}
                                className="flex items-center justify-center gap-2 py-2.5 bg-accent/50 border border-border hover:bg-accent text-[11px] font-bold rounded-lg transition-all text-muted-foreground hover:text-foreground"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                FULL CHAT
                            </button>
                            <button
                                onClick={handleComplete}
                                className="flex items-center justify-center gap-2 py-2.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-[11px] font-bold rounded-lg transition-all text-emerald-400"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                COMPLETE
                            </button>
                        </div>
                    </div>
                </>
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
