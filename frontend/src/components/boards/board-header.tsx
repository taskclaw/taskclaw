'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Settings, ChevronRight, Zap, BrainCircuit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { updateBoard, getBoardIntegrations } from '@/app/dashboard/boards/actions'
import { BoardIntegrationDialog } from './board-integration-dialog'
import { BoardAIChat } from './board-ai-chat'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Board, IntegrationStatus } from '@/types/board'

interface BoardHeaderProps {
    board: Board
    onNewTask: () => void
}

export function BoardHeader({ board, onNewTask }: BoardHeaderProps) {
    const [fullAi, setFullAi] = useState(board.settings_override?.full_ai === true)
    const [toggling, setToggling] = useState(false)
    const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
    const [selectedIntegration, setSelectedIntegration] = useState<IntegrationStatus | null>(null)
    const [showBoardChat, setShowBoardChat] = useState(false)
    const qc = useQueryClient()

    const loadIntegrations = useCallback(async () => {
        const data = await getBoardIntegrations(board.id)
        setIntegrations(data)
    }, [board.id])

    useEffect(() => {
        loadIntegrations()
    }, [loadIntegrations])

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

    const getIntegrationColor = (integration: IntegrationStatus) => {
        if (integration.enabled && integration.has_config) {
            return 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
        }
        if (integration.required) {
            return 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
        }
        return 'bg-muted text-muted-foreground hover:bg-accent'
    }

    const getIntegrationTooltip = (integration: IntegrationStatus) => {
        if (integration.enabled && integration.has_config) {
            return `${integration.name} — Connected`
        }
        if (integration.required) {
            return `${integration.name} — Required, not configured`
        }
        return `${integration.name} — Not configured`
    }

    return (
        <>
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

                    {/* Integration Status Icons */}
                    {integrations.length > 0 && (
                        <>
                            <Separator orientation="vertical" className="h-4" />
                            <div className="flex items-center gap-1">
                                {integrations.map((integration) => (
                                    <Tooltip key={integration.slug}>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={() => setSelectedIntegration(integration)}
                                                className={`w-7 h-7 rounded-md flex items-center justify-center text-sm transition-colors ${getIntegrationColor(integration)}`}
                                            >
                                                {integration.icon}
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="text-xs">
                                            {getIntegrationTooltip(integration)}
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                            </div>
                        </>
                    )}

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowBoardChat(true)}
                            >
                                <BrainCircuit className="w-4 h-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            Board AI Chat — Bulk create tasks with AI
                        </TooltipContent>
                    </Tooltip>
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

            {/* Integration Setup Dialog */}
            {selectedIntegration && (
                <BoardIntegrationDialog
                    integration={selectedIntegration}
                    boardId={board.id}
                    open={!!selectedIntegration}
                    onOpenChange={(open) => {
                        if (!open) setSelectedIntegration(null)
                    }}
                    onSaved={loadIntegrations}
                />
            )}

            {/* Board AI Chat Modal */}
            {showBoardChat && (
                <BoardAIChat
                    boardId={board.id}
                    boardName={board.name}
                    onClose={() => setShowBoardChat(false)}
                />
            )}
        </>
    )
}
