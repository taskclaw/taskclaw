'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useBoard } from '@/hooks/use-boards'
import { getCategories } from '@/app/dashboard/tasks/actions'
import { BoardKanbanView } from '@/components/boards/board-kanban-view'
import { Loader2 } from 'lucide-react'

export default function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
    const { boardId } = use(params)
    const { data: board, isLoading: boardLoading } = useBoard(boardId)
    const { data: categories = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: () => getCategories(),
        staleTime: 60000,
    })

    if (boardLoading) {
        return (
            <div className="flex items-center justify-center flex-1 min-h-[400px]">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!board) {
        return (
            <div className="flex items-center justify-center flex-1 min-h-[400px]">
                <p className="text-muted-foreground">Board not found</p>
            </div>
        )
    }

    return <BoardKanbanView board={board} categories={categories} />
}
