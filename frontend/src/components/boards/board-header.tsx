'use client'

import { useState } from 'react'
import { Plus, Settings, ChevronRight, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { updateBoard } from '@/app/dashboard/boards/actions'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Board } from '@/types/board'

interface BoardHeaderProps {
    board: Board
    onNewTask: () => void
}

export function BoardHeader({ board, onNewTask }: BoardHeaderProps) {
    const [fullAi, setFullAi] = useState(board.settings_override?.full_ai === true)
    const [toggling, setToggling] = useState(false)
    const qc = useQueryClient()

    const handleToggleFullAi = async (checked: boolean) => {
        setFullAi(checked)
        setToggling(true)
        try {
            const result = await updateBoard(board.id, {
                settings_override: { ...board.settings_override, full_ai: checked },
            })
            if (result.error) {
                setFullAi(!checked)
                toast.error(result.error)
            } else {
                qc.invalidateQueries({ queryKey: ['board'] })
            }
        } catch {
            setFullAi(!checked)
        } finally {
            setToggling(false)
        }
    }

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
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                    <Zap className={`w-3.5 h-3.5 ${fullAi ? 'text-amber-500' : 'text-muted-foreground'}`} />
                    <span className={`text-xs font-medium ${fullAi ? 'text-foreground' : 'text-muted-foreground'}`}>
                        Full AI
                    </span>
                    <Switch
                        checked={fullAi}
                        onCheckedChange={handleToggleFullAi}
                        disabled={toggling}
                        className="scale-75"
                    />
                </div>
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
