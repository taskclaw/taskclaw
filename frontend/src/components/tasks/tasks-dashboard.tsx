'use client'

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTasks } from '@/hooks/use-tasks'
import { useTaskFilters } from '@/hooks/use-task-filters'
import { useTaskStore } from '@/hooks/use-task-store'
import { SidebarTrigger } from '@/components/ui/sidebar'
import type { Category } from '@/types/task'
import { KanbanBoard } from './kanban-board'
import { CategoryList } from './category-list'
import { CategoryFilter } from './category-filter'
import { SourceFilter } from './source-filter'
import { TasksViewToggle } from './tasks-view-toggle'
import { PomodoroTimer } from './pomodoro-timer'
import { TaskDetailPanel } from './task-detail-panel'

// Create query client for this scope
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
        },
    },
})

interface TasksDashboardInnerProps {
    categories: Category[]
}

function TasksDashboardInner({ categories }: TasksDashboardInnerProps) {
    const { data: tasks, isLoading, error } = useTasks()
    const { viewMode, setViewMode, selectedCategories, selectedPriority, selectedSource, searchQuery, setSearchQuery } =
        useTaskFilters()
    const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
    const searchParams = useSearchParams()

    // Sync URL ?view= param with Zustand view mode (triggered by sidebar links)
    useEffect(() => {
        const viewParam = searchParams.get('view')
        if (viewParam === 'category' || viewParam === 'kanban') {
            setViewMode(viewParam)
        }
    }, [searchParams, setViewMode])

    // Build set of visible category IDs (categories where visible !== false)
    const visibleCategoryIds = useMemo(
        () => new Set(categories.filter((c) => c.visible !== false).map((c) => c.id)),
        [categories],
    )

    // Filter tasks: exclude hidden categories, then apply user filters
    const filteredTasks = useMemo(() => {
        if (!tasks) return []
        return tasks.filter((t) => {
            // Always hide tasks from hidden categories
            if (t.category_id && !visibleCategoryIds.has(t.category_id)) {
                return false
            }
            if (
                selectedCategories.length > 0 &&
                !selectedCategories.includes(t.category_id || '')
            ) {
                return false
            }
            if (selectedPriority && t.priority !== selectedPriority) {
                return false
            }
            // Source filter
            if (selectedSource !== 'all') {
                if (selectedSource === 'local') {
                    if (t.source_id) return false
                } else {
                    if (t.sources?.provider !== selectedSource) return false
                }
            }
            if (
                searchQuery &&
                !t.title.toLowerCase().includes(searchQuery.toLowerCase())
            ) {
                return false
            }
            return true
        })
    }, [tasks, visibleCategoryIds, selectedCategories, selectedPriority, selectedSource, searchQuery])

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3">
                    <p className="text-destructive text-sm">Failed to connect to API</p>
                    <p className="text-muted-foreground text-xs">
                        Make sure the backend is running on port 3001
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 flex overflow-hidden min-h-0 -m-4 -mb-4">
            <main className="flex-1 flex flex-col overflow-hidden min-h-0">
                {/* Header Bar */}
                <div className="flex items-center justify-between px-6 py-3 mt-[5px] border-b border-border shrink-0">
                    <div className="flex items-center gap-4">
                        <SidebarTrigger className="-ml-1" />
                        <h2 className="text-lg font-bold">Tasks</h2>
                        <TasksViewToggle />
                        <div className="h-5 w-px bg-border" />
                        <CategoryFilter categories={categories} />
                        <div className="h-5 w-px bg-border" />
                        <SourceFilter />
                    </div>

                    <div className="flex items-center gap-4">
                        <PomodoroTimer />
                        <div className="flex items-center gap-2 bg-accent/50 border border-border rounded-full px-3 py-1.5">
                            <Search className="w-3.5 h-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-transparent text-xs placeholder-muted-foreground outline-none w-32"
                            />
                        </div>
                        {tasks && (
                            <span className="text-[10px] text-muted-foreground">
                                {filteredTasks.length} tasks
                            </span>
                        )}
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center h-64">
                        <div className="flex items-center gap-3 text-muted-foreground text-sm">
                            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            Loading tasks...
                        </div>
                    </div>
                )}

                {/* Board Views */}
                {!isLoading && viewMode === 'kanban' && (
                    <div className="flex-1 overflow-x-auto p-6 min-h-0">
                        <KanbanBoard tasks={filteredTasks} categories={categories} />
                    </div>
                )}

                {!isLoading && viewMode === 'category' && (
                    <div className="flex-1 overflow-y-auto p-6 min-h-0">
                        <CategoryList tasks={filteredTasks} categories={categories} />
                    </div>
                )}
            </main>

            {/* Task Detail Drawer (fixed overlay) */}
            {selectedTaskId && <TaskDetailPanel categories={categories} />}
        </div>
    )
}

interface TasksDashboardProps {
    categories: Category[]
}

export function TasksDashboard({ categories }: TasksDashboardProps) {
    return (
        <QueryClientProvider client={queryClient}>
            <TasksDashboardInner categories={categories} />
        </QueryClientProvider>
    )
}
