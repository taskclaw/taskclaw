'use client'

import { LayoutList, LayoutGrid } from 'lucide-react'
import { useTaskFilters } from '@/hooks/use-task-filters'
import { cn } from '@/lib/utils'

export function TasksViewToggle() {
    const { viewMode, setViewMode } = useTaskFilters()

    return (
        <div className="flex items-center bg-accent/50 border border-border p-1 rounded-lg">
            <button
                onClick={() => setViewMode('category')}
                className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    viewMode === 'category'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                )}
            >
                <LayoutList className="w-3.5 h-3.5" />
                By Agent
            </button>
            <button
                onClick={() => setViewMode('kanban')}
                className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    viewMode === 'kanban'
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-muted-foreground hover:text-foreground',
                )}
            >
                <LayoutGrid className="w-3.5 h-3.5" />
                Kanban
            </button>
        </div>
    )
}
