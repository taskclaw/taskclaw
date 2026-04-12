'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, Zap, BrainCircuit, Link2Off, CheckCircle2, GitBranch, Bot } from 'lucide-react'
import type { Task, Category } from '@/types/task'
import { PRIORITY_COLORS } from '@/types/task'
import { useTaskStore } from '@/hooks/use-task-store'
import { usePomodoroStore } from '@/hooks/use-pomodoro'
import { cn } from '@/lib/utils'

interface TaskCardProps {
    task: Task
    isDone?: boolean
    categories?: Category[]
}

export function TaskCard({ task, isDone, categories = [] }: TaskCardProps) {
    const setSelectedTaskId = useTaskStore((s) => s.setSelectedTaskId)
    const activeTaskId = usePomodoroStore((s) => s.activeTaskId)
    const isActive = activeTaskId === task.id

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    // Resolve category color from categories list or use default
    const category = categories.find((c) => c.id === task.category_id)
    const categoryColor = category?.color || '#71717a'
    const categoryName = category?.name || task.category || 'Unassigned'

    const priorityColor = task.priority
        ? PRIORITY_COLORS[task.priority]
        : undefined
    const isAIRunning = task.status === 'AI Running'
    const isInReview = task.status === 'In Review'

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => setSelectedTaskId(task.id)}
            className={cn(
                'bg-card border border-border p-3 rounded-lg cursor-grab transition-all group relative',
                isDragging && 'opacity-50 rotate-2 scale-105 z-10',
                isDone && 'opacity-60',
                isAIRunning && 'ring-1 ring-claw-red/30 border-claw-red/20 bg-claw-red/5',
                isInReview && 'ring-1 ring-purple-500/30 border-purple-500/20 bg-purple-500/5',
                isActive && 'ring-1 ring-primary/30 border-primary/20 bg-primary/5',
                !isDone && !isDragging && 'hover:border-muted-foreground/30 hover:shadow-sm',
            )}
        >
            {/* Category badge */}
            <div className="flex items-center gap-2 mb-2">
                <span
                    className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-tight"
                    style={{
                        color: categoryColor,
                        backgroundColor: `${categoryColor}15`,
                    }}
                >
                    {categoryName}
                </span>
                {priorityColor && (
                    <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: priorityColor }}
                    />
                )}
                {task.dag_id && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-tight text-indigo-500 bg-indigo-500/10 flex items-center gap-0.5">
                        <GitBranch className="w-2.5 h-2.5" />
                        DAG
                    </span>
                )}
                {task.result && (
                    <span title={typeof task.result === 'object' ? JSON.stringify(task.result).slice(0, 100) : 'Completed with result'}>
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    </span>
                )}
            </div>

            {/* Title */}
            <h3
                className={cn(
                    'text-sm font-medium mb-2 leading-tight',
                    isDone && 'line-through text-muted-foreground',
                )}
            >
                {task.title}
            </h3>

            {/* Footer */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {task.due_date && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Calendar className="w-2.5 h-2.5" />
                            {new Date(task.due_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                            })}
                        </div>
                    )}

                    {isActive && (
                        <div className="flex items-center gap-1 text-primary text-[10px] font-bold">
                            <Zap className="w-3 h-3" />
                            ACTIVE
                        </div>
                    )}

                    {isAIRunning && (
                        <div className="flex items-center gap-1 text-claw-red text-[10px] font-bold">
                            <BrainCircuit className="w-3 h-3 animate-pulse" />
                            AI RUNNING
                        </div>
                    )}

                    {isInReview && (
                        <div className="flex items-center gap-1 text-purple-400 text-[10px] font-bold">
                            <BrainCircuit className="w-3 h-3" />
                            IN REVIEW
                        </div>
                    )}

                    {isDone && task.updated_at && (
                        <span className="text-[10px] text-muted-foreground italic">
                            {new Date(task.updated_at).toLocaleDateString()}
                        </span>
                    )}
                </div>

                {/* Agent assignee avatar */}
                {task.assignee_type === 'agent' && task.assignee_agent && (
                    <AgentMiniAvatar agent={task.assignee_agent} />
                )}

                {/* Source badge */}
                {task.source_id && task.sources?.provider ? (
                    <span
                        className={cn(
                            'text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-1',
                            task.sources.provider === 'notion'
                                ? 'text-white/80 bg-white/10'
                                : task.sources.provider === 'clickup'
                                  ? 'text-violet-300 bg-violet-500/15'
                                  : 'text-muted-foreground bg-accent/50',
                        )}
                    >
                        {task.sources.provider === 'notion' ? (
                            <svg viewBox="0 0 100 100" className="w-2.5 h-2.5" fill="currentColor">
                                <path d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z"/>
                            </svg>
                        ) : task.sources.provider === 'clickup' ? (
                            <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="currentColor">
                                <path d="M4.105 18.214l3.143-2.406c1.87 2.446 4.05 3.592 6.752 3.592 2.717 0 4.904-1.136 6.763-3.552l3.113 2.448C21.302 21.596 18.33 23.4 14 23.4c-4.345 0-7.327-1.822-9.895-5.186z"/>
                                <path d="M7.09 12.06l3.143-2.406L14 13.042l3.767-3.388 3.113 2.448L14 18.6 7.09 12.06z"/>
                            </svg>
                        ) : null}
                        {task.sources.provider}
                    </span>
                ) : (
                    <span className="text-[9px] text-muted-foreground/40 flex items-center gap-1 px-1.5 py-0.5">
                        <Link2Off className="w-2.5 h-2.5" />
                        Local
                    </span>
                )}
            </div>
        </div>
    )
}

function AgentMiniAvatar({ agent }: { agent: { id: string; name: string; color: string | null; avatar_url: string | null } }) {
    const initials = agent.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    const color = agent.color ?? '#6366f1'

    if (agent.avatar_url) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={agent.avatar_url}
                alt={agent.name}
                title={agent.name}
                className="w-4 h-4 rounded object-cover"
                style={{ border: `1px solid ${color}40` }}
            />
        )
    }

    return (
        <span
            title={agent.name}
            className="w-4 h-4 rounded flex items-center justify-center text-[7px] font-bold shrink-0"
            style={{ backgroundColor: `${color}25`, color }}
        >
            {initials || <Bot className="w-2.5 h-2.5" />}
        </span>
    )
}
