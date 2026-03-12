'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Task, Category } from '@/types/task'
import { PRIORITY_COLORS } from '@/types/task'
import { useTaskStore } from '@/hooks/use-task-store'
import { cn } from '@/lib/utils'
import { Settings } from 'lucide-react'
import { NewTaskDialog } from './new-task-dialog'

interface CategoryListProps {
    tasks: Task[]
    categories: Category[]
}

export function CategoryList({ tasks, categories }: CategoryListProps) {
    const [showNewTask, setShowNewTask] = useState<string | null>(null)
    const setSelectedTaskId = useTaskStore((s) => s.setSelectedTaskId)

    // Only show visible categories
    const visibleCategories = categories.filter((c) => c.visible !== false)

    const getTasksByCategory = (cat: Category) =>
        tasks
            .filter((t) => t.category_id === cat.id && !t.completed)
            .sort((a, b) => {
                const order: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
                return (
                    (order[a.priority as string] ?? 3) -
                    (order[b.priority as string] ?? 3)
                )
            })

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                {visibleCategories.map((cat) => {
                    const catTasks = getTasksByCategory(cat)
                    const color = cat.color || '#71717a'

                    return (
                        <div
                            key={cat.id}
                            className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4"
                        >
                            {/* Category Header */}
                            <div className="flex items-center justify-between border-b border-border pb-3">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: color }}
                                    />
                                    <h3 className="text-sm font-semibold">{cat.name}</h3>
                                    <span className="text-[10px] text-muted-foreground">
                                        {catTasks.length}
                                    </span>
                                </div>
                                <Link
                                    href={`/dashboard/settings/categories?edit=${cat.id}`}
                                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                    title={`${cat.name} settings`}
                                >
                                    <Settings className="h-3.5 w-3.5" />
                                </Link>
                            </div>

                            {/* Tasks */}
                            <div className="space-y-2">
                                {catTasks.map((task) => (
                                    <div
                                        key={task.id}
                                        onClick={() => setSelectedTaskId(task.id)}
                                        className={cn(
                                            'group flex items-center justify-between p-3 rounded-xl',
                                            'bg-accent/50 border border-border hover:border-muted-foreground/30 cursor-pointer transition-all',
                                        )}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs font-medium truncate block">
                                                {task.title}
                                            </span>
                                            {task.status && (
                                                <span className="text-[9px] text-muted-foreground uppercase">
                                                    {task.status}
                                                </span>
                                            )}
                                        </div>
                                        {task.priority && (
                                            <span
                                                className="w-1.5 h-1.5 rounded-full flex-shrink-0 ml-2"
                                                style={{
                                                    backgroundColor:
                                                        PRIORITY_COLORS[task.priority] || '#71717a',
                                                }}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Add */}
                            <button
                                onClick={() => setShowNewTask(cat.id)}
                                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground transition-all"
                            >
                                + New Task
                            </button>
                        </div>
                    )
                })}
            </div>

            {showNewTask && (
                <NewTaskDialog
                    defaultCategoryId={showNewTask}
                    categories={categories}
                    onClose={() => setShowNewTask(null)}
                />
            )}
        </>
    )
}
