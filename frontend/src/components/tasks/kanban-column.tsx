'use client'

import { useDroppable } from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import type { Task, TaskStatus, Category } from '@/types/task'
import { STATUS_COLORS } from '@/types/task'
import { TaskCard } from './task-card'
import { cn } from '@/lib/utils'

interface KanbanColumnProps {
    status: TaskStatus
    tasks: Task[]
    categories?: Category[]
    onAddTask?: () => void
}

export function KanbanColumn({
    status,
    tasks,
    categories = [],
    onAddTask,
}: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({ id: status })
    const color = STATUS_COLORS[status]

    return (
        <div className="w-72 flex flex-col flex-shrink-0 min-h-0">
            {/* Column Header */}
            <div className="flex items-center justify-between px-2 mb-3 shrink-0">
                <div className="flex items-center gap-2">
                    <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wider uppercase"
                        style={{
                            color,
                            backgroundColor: `${color}15`,
                        }}
                    >
                        {status}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">
                        {tasks.length}
                    </span>
                </div>
            </div>

            {/* Droppable Area */}
            <div
                ref={setNodeRef}
                className={cn(
                    'flex flex-col gap-2.5 flex-1 min-h-0 p-1 rounded-lg transition-colors overflow-y-auto',
                    isOver && 'bg-primary/5 ring-1 ring-primary/20',
                )}
            >
                <SortableContext
                    items={tasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {tasks.map((task) => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            isDone={status === 'Done'}
                            categories={categories}
                        />
                    ))}
                </SortableContext>

                {/* Add Task button — only on actionable columns */}
                {status !== 'Done' && status !== 'AI Running' && status !== 'In Review' && (
                    <button
                        onClick={onAddTask}
                        className="border border-dashed border-border p-2.5 rounded-lg text-muted-foreground text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-all flex items-center justify-center gap-2 shrink-0"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        New Task
                    </button>
                )}
            </div>
        </div>
    )
}
