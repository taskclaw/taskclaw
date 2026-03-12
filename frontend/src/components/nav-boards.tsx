"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import {
    MoreHorizontal,
    Plus,
    Star,
    Copy,
    Download,
    Archive,
    Trash2,
    Pencil,
    LayoutGrid,
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar"
import { useBoards, useUpdateBoard, useDeleteBoard, useDuplicateBoard } from "@/hooks/use-boards"
import { exportBoard } from "@/app/dashboard/boards/actions"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { Board } from "@/types/board"

const MAX_VISIBLE = 5

export function NavBoards() {
    const { isMobile } = useSidebar()
    const router = useRouter()
    const pathname = usePathname()
    const { data: boards = [] } = useBoards()
    const updateBoard = useUpdateBoard()
    const deleteBoard = useDeleteBoard()
    const duplicateBoard = useDuplicateBoard()
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const visibleBoards = boards.slice(0, MAX_VISIBLE)
    const hasMore = boards.length > MAX_VISIBLE

    const handleFavorite = async (board: Board) => {
        await updateBoard.mutateAsync({
            id: board.id,
            is_favorite: !board.is_favorite,
        })
    }

    const handleDuplicate = async (boardId: string) => {
        const result = await duplicateBoard.mutateAsync(boardId)
        if (result.success) {
            toast.success('Board duplicated')
        } else {
            toast.error(result.error || 'Failed to duplicate board')
        }
    }

    const handleExport = async (boardId: string, boardName: string) => {
        const manifest = await exportBoard(boardId)
        if (manifest) {
            const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${boardName.toLowerCase().replace(/\s+/g, '-')}.json`
            a.click()
            URL.revokeObjectURL(url)
            toast.success('Board exported')
        }
    }

    const handleArchive = async (board: Board) => {
        await updateBoard.mutateAsync({
            id: board.id,
            is_archived: true,
        })
        toast.success('Board archived')
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const result = await deleteBoard.mutateAsync(deleteTarget.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                setDeleteTarget(null)
                setDeletingId(deleteTarget.id)
                setTimeout(() => {
                    setDeletingId(null)
                    toast.success('Board deleted')
                    router.refresh()
                }, 500)
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete board')
        } finally {
            setDeleteLoading(false)
        }
    }

    const isActive = (boardId: string) =>
        pathname === `/dashboard/boards/${boardId}`

    return (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel className="flex items-center justify-between">
                <span>Boards</span>
                <button
                    onClick={() => router.push('/dashboard/boards?create=true')}
                    className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </SidebarGroupLabel>
            <SidebarMenu>
                {visibleBoards.map((board) => (
                    <SidebarMenuItem
                        key={board.id}
                        className={cn(deletingId === board.id && 'animate-deleting')}
                    >
                        <SidebarMenuButton
                            asChild
                            isActive={isActive(board.id)}
                        >
                            <a href={`/dashboard/boards/${board.id}`}>
                                {board.is_favorite ? (
                                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                                ) : (
                                    <LayoutGrid className="w-4 h-4" />
                                )}
                                <span className="truncate">{board.name}</span>
                            </a>
                        </SidebarMenuButton>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuAction showOnHover suppressHydrationWarning>
                                    <MoreHorizontal />
                                    <span className="sr-only">More</span>
                                </SidebarMenuAction>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                className="w-48 rounded-lg"
                                side={isMobile ? "bottom" : "right"}
                                align={isMobile ? "end" : "start"}
                            >
                                <DropdownMenuItem onClick={() => handleFavorite(board)}>
                                    <Star className="text-muted-foreground" />
                                    <span>{board.is_favorite ? 'Unfavorite' : 'Favorite'}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push(`/dashboard/boards/${board.id}/settings`)}>
                                    <Pencil className="text-muted-foreground" />
                                    <span>Rename</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDuplicate(board.id)}>
                                    <Copy className="text-muted-foreground" />
                                    <span>Duplicate</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExport(board.id, board.name)}>
                                    <Download className="text-muted-foreground" />
                                    <span>Export JSON</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleArchive(board)}>
                                    <Archive className="text-muted-foreground" />
                                    <span>Archive</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setDeleteTarget({ id: board.id, name: board.name })
                                    }}
                                >
                                    <Trash2 className="text-muted-foreground" />
                                    <span>Delete</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                ))}

                {hasMore && (
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            asChild
                            className="text-primary hover:text-primary"
                        >
                            <a href="/dashboard/boards">
                                <span className="text-xs">See all ({boards.length})</span>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                )}
            </SidebarMenu>

            <ConfirmDeleteDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={confirmDelete}
                title="Delete board?"
                description="This will permanently delete this board. Tasks will become unassigned."
                loading={deleteLoading}
            />
        </SidebarGroup>
    )
}
