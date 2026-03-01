'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus, MoreHorizontal, Sparkles, Settings2, Link2, Unlink } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { updateBoardStep } from '@/app/dashboard/boards/actions'
import { getCategories } from '@/app/dashboard/settings/categories/actions'
import type { Task, Category } from '@/types/task'
import type { BoardStep } from '@/types/board'
import { TaskCard } from '@/components/tasks/task-card'
import { StepConfigDrawer } from './step-config-drawer'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface BoardKanbanColumnProps {
    step: BoardStep
    allSteps: BoardStep[]
    boardId: string
    tasks: Task[]
    categories?: Category[]
    onAddTask?: () => void
}

export function BoardKanbanColumn({
    step,
    allSteps,
    boardId,
    tasks,
    categories = [],
    onAddTask,
}: BoardKanbanColumnProps) {
    const qc = useQueryClient()
    const { setNodeRef, isOver } = useDroppable({ id: step.id })
    const color = step.color || '#71717a'
    const linkedCat = step.linked_category

    const [showConfigDrawer, setShowConfigDrawer] = useState(false)
    const [showCategoryPicker, setShowCategoryPicker] = useState(false)

    const { data: allCategories = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: () => getCategories(),
        enabled: showCategoryPicker,
    })

    const linkCategory = useMutation({
        mutationFn: async (categoryId: string | null) => {
            const result = await updateBoardStep(boardId, step.id, { linked_category_id: categoryId })
            if (result.error) throw new Error(result.error)
            return result
        },
        onSuccess: () => {
            setShowCategoryPicker(false)
            qc.invalidateQueries({ queryKey: ['board', boardId] })
            qc.invalidateQueries({ queryKey: ['boards'] })
            toast.success('Category link updated')
        },
        onError: (e: Error) => toast.error(e.message),
    })

    return (
        <div className="w-72 flex flex-col flex-shrink-0 min-h-0">
            {/* Column Header — fixed height for consistency */}
            <div className="px-2 mb-3 shrink-0 h-[52px]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                        <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                        />
                        <span className="text-sm font-semibold text-foreground truncate">
                            {step.name}
                        </span>
                        <span className="text-xs text-muted-foreground font-medium shrink-0">
                            {tasks.length}
                        </span>
                    </div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="text-muted-foreground hover:text-foreground transition-colors p-1 shrink-0">
                                <MoreHorizontal className="w-4 h-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-lg">
                            <DropdownMenuItem onClick={() => setShowConfigDrawer(true)}>
                                <Settings2 className="text-muted-foreground" />
                                <span>Edit Step</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowCategoryPicker(true)}>
                                <Link2 className="text-muted-foreground" />
                                <span>{step.linked_category_id ? 'Change Category' : 'Link Category'}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Linked category indicator — always reserves the line space */}
                <div className="h-5 flex items-center ml-4">
                    {linkedCat ? (
                        <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-primary/60 shrink-0" />
                            <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: linkedCat.color || '#71717a' }}
                            />
                            <span className="text-[10px] text-primary/60 font-medium truncate">
                                {linkedCat.name}
                            </span>
                        </div>
                    ) : null}
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
                            isDone={step.step_type === 'done'}
                            categories={categories}
                        />
                    ))}
                </SortableContext>

                {/* Add Task button */}
                {step.step_type !== 'done' && (
                    <button
                        onClick={onAddTask}
                        className="border border-dashed border-border p-2.5 rounded-lg text-muted-foreground text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-all flex items-center justify-center gap-2 shrink-0"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        New Task
                    </button>
                )}
            </div>

            {/* Step Config Drawer */}
            {showConfigDrawer && (
                <StepConfigDrawer
                    boardId={boardId}
                    step={step}
                    allSteps={allSteps}
                    onClose={() => setShowConfigDrawer(false)}
                />
            )}

            {/* Category Picker Popover */}
            {showCategoryPicker && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowCategoryPicker(false)} />
                    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-64 bg-popover border border-border rounded-lg shadow-xl py-1 max-h-80 overflow-y-auto">
                        <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Link Category to &ldquo;{step.name}&rdquo;
                        </div>
                        {step.linked_category_id && (
                            <button
                                onClick={() => linkCategory.mutate(null)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                            >
                                <Unlink className="w-3.5 h-3.5" />
                                Unlink category
                            </button>
                        )}
                        <div className="border-t border-border my-1" />
                        {allCategories.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                                No categories found
                            </div>
                        ) : (
                            allCategories.map((cat: any) => (
                                <button
                                    key={cat.id}
                                    onClick={() => linkCategory.mutate(cat.id)}
                                    className={cn(
                                        'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors',
                                        step.linked_category_id === cat.id && 'bg-primary/10 text-primary',
                                    )}
                                >
                                    <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10"
                                        style={{ backgroundColor: cat.color || '#71717a' }}
                                    />
                                    <span className="truncate">{cat.name}</span>
                                    {step.linked_category_id === cat.id && (
                                        <span className="ml-auto text-[9px] text-primary">linked</span>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
