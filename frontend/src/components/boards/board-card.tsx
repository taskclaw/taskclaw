'use client'

import { useRouter } from 'next/navigation'
import {
    Star,
    MoreHorizontal,
    Pencil,
    Copy,
    Download,
    Archive,
    Trash2,
    LayoutGrid,
    Layers,
    Clock,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Board } from '@/types/board'
import { BoardIcon } from '@/lib/board-icon'
import { cn } from '@/lib/utils'

interface BoardCardProps {
    board: Board
    onFavorite: (board: Board) => void
    onDuplicate: (boardId: string) => void
    onExport: (boardId: string, boardName: string) => void
    onArchive: (board: Board) => void
    onDelete: (board: Board) => void
}

export function BoardCard({
    board,
    onFavorite,
    onDuplicate,
    onExport,
    onArchive,
    onDelete,
}: BoardCardProps) {
    const router = useRouter()
    const color = board.color || '#6366f1'
    const stepCount = board.board_steps?.length || 0
    const taskCount = board.task_count || 0

    const timeAgo = (date: string) => {
        const diff = Date.now() - new Date(date).getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 60) return `${mins}m ago`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `${hours}h ago`
        const days = Math.floor(hours / 24)
        if (days < 30) return `${days}d ago`
        return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    return (
        <div
            onClick={() => router.push(`/dashboard/boards/${board.id}`)}
            className={cn(
                'bg-card border border-border rounded-xl overflow-hidden cursor-pointer transition-all group hover:border-muted-foreground/30 hover:shadow-lg hover:shadow-black/10',
                board.is_archived && 'opacity-60',
            )}
        >
            {/* Colored top border */}
            <div className="h-1" style={{ backgroundColor: color }} />

            <div className="p-4">
                {/* Header row: icon + title + actions */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
                            style={{
                                backgroundColor: `${color}20`,
                                color: color,
                            }}
                        >
                            <BoardIcon name={board.icon} className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold truncate">{board.name}</h3>
                            {board.description && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                    {board.description}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onFavorite(board)
                            }}
                            className={cn(
                                'p-1.5 rounded transition-colors',
                                board.is_favorite
                                    ? 'text-amber-400'
                                    : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-amber-400',
                            )}
                        >
                            <Star className={cn('w-3.5 h-3.5', board.is_favorite && 'fill-amber-400')} />
                        </button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1.5 rounded text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground transition-all"
                                >
                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 rounded-lg">
                                <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation()
                                    router.push(`/dashboard/boards/${board.id}/settings`)
                                }}>
                                    <Pencil className="text-muted-foreground" />
                                    <span>Edit</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation()
                                    onDuplicate(board.id)
                                }}>
                                    <Copy className="text-muted-foreground" />
                                    <span>Duplicate</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation()
                                    onExport(board.id, board.name)
                                }}>
                                    <Download className="text-muted-foreground" />
                                    <span>Export JSON</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation()
                                    onArchive(board)
                                }}>
                                    <Archive className="text-muted-foreground" />
                                    <span>{board.is_archived ? 'Unarchive' : 'Archive'}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation()
                                    onDelete(board)
                                }}>
                                    <Trash2 className="text-muted-foreground" />
                                    <span>Delete</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Tags */}
                {board.tags && board.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                        {board.tags.slice(0, 3).map((tag) => (
                            <span
                                key={tag}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-accent/50 text-muted-foreground font-medium"
                            >
                                {tag}
                            </span>
                        ))}
                        {board.tags.length > 3 && (
                            <span className="text-[9px] px-1.5 py-0.5 text-muted-foreground/50">
                                +{board.tags.length - 3}
                            </span>
                        )}
                    </div>
                )}

                {/* Stats footer */}
                <div className="flex items-center gap-3 pt-3 border-t border-border text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        <span>{stepCount} steps</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <LayoutGrid className="w-3 h-3" />
                        <span>{taskCount} cards</span>
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo(board.updated_at)}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
