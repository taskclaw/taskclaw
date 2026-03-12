'use client'

import { Plus, Settings, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import type { Board } from '@/types/board'

interface BoardHeaderProps {
    board: Board
    onNewTask: () => void
}

export function BoardHeader({ board, onNewTask }: BoardHeaderProps) {
    return (
        <header className="flex h-16 shrink-0 items-center gap-2">
            <div className="flex items-center gap-2 flex-1">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <nav className="flex items-center gap-1 text-sm">
                    <a href="/dashboard/boards" className="text-muted-foreground hover:text-foreground transition-colors hidden md:block">
                        Boards
                    </a>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground hidden md:block" />
                    <span className="font-semibold">{board.name}</span>
                </nav>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" asChild>
                    <a href={`/dashboard/boards/${board.id}/settings`}>
                        <Settings className="w-4 h-4" />
                    </a>
                </Button>
                <Button onClick={onNewTask} size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    New Task
                </Button>
            </div>
        </header>
    )
}
