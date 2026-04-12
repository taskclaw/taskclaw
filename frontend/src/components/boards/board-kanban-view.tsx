'use client'

import { useState } from 'react'
import {
    DndContext,
    DragOverlay,
    closestCorners,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import type { Task, Category } from '@/types/task'
import type { Board, BoardStep } from '@/types/board'
import { useBoardTasks, useMoveTaskToStep } from '@/hooks/use-boards'
import { BoardKanbanColumn } from './board-kanban-column'
import { BoardHeader } from './board-header'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskDetailPanel } from '@/components/tasks/task-detail-panel'
import { useTaskStore } from '@/hooks/use-task-store'
import { NewBoardTaskDialog } from './new-board-task-dialog'

interface BoardKanbanViewProps {
    board: Board
    categories: Category[]
}

export function BoardKanbanView({ board, categories }: BoardKanbanViewProps) {
    const steps = board.board_steps || []
    const { data: tasks = [] } = useBoardTasks(board.id)
    const moveTaskToStep = useMoveTaskToStep()
    const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
    const [activeTask, setActiveTask] = useState<Task | null>(null)
    const [showNewTask, setShowNewTask] = useState<BoardStep | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    )

    const getTasksByStep = (stepId: string) =>
        tasks.filter((t: any) => t.current_step_id === stepId)

    function handleDragStart(event: DragStartEvent) {
        const task = tasks.find((t: any) => t.id === event.active.id)
        if (task) setActiveTask(task as Task)
    }

    function handleDragEnd(event: DragEndEvent) {
        setActiveTask(null)
        const { active, over } = event
        if (!over) return

        const taskId = active.id as string
        const overId = over.id as string

        // Check if dropped on a step column
        const targetStep = steps.find((s) => s.id === overId)
            || steps.find((s) =>
                getTasksByStep(s.id).some((t: any) => t.id === overId)
            )

        if (!targetStep) return

        const task = tasks.find((t: any) => t.id === taskId)
        if (task && (task as any).current_step_id !== targetStep.id) {
            moveTaskToStep.mutate({
                taskId,
                stepId: targetStep.id,
                stepName: targetStep.name,
            })
        }
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 h-full w-full">
            <BoardHeader
                board={board}
                onNewTask={() => setShowNewTask(steps[0] || null)}
            />

            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden pb-2">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <div className="flex gap-3 h-full min-w-max px-0.5">
                        {steps.map((step) => (
                            <BoardKanbanColumn
                                key={step.id}
                                step={step}
                                allSteps={steps}
                                boardId={board.id}
                                tasks={getTasksByStep(step.id) as Task[]}
                                categories={categories}
                                boardDefaultCategory={board.default_category}
                                onAddTask={() => setShowNewTask(step)}
                            />
                        ))}
                    </div>

                    <DragOverlay>
                        {activeTask && <TaskCard task={activeTask} categories={categories} />}
                    </DragOverlay>
                </DndContext>
            </div>

            {showNewTask && (
                <NewBoardTaskDialog
                    boardId={board.id}
                    step={showNewTask}
                    categories={categories}
                    onClose={() => setShowNewTask(null)}
                />
            )}

            {selectedTaskId && (
                <TaskDetailPanel
                    categories={categories}
                    boardSteps={steps}
                />
            )}
        </div>
    )
}
