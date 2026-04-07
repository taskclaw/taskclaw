'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { usePod, usePodBoards } from '@/hooks/use-pods'
import { BoardCard } from '@/components/boards/board-card'
import { useUpdateBoard, useDeleteBoard, useDuplicateBoard } from '@/hooks/use-boards'
import { exportBoard } from '@/app/dashboard/boards/actions'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
    Layers,
    Plus,
    MessageCircle,
    Settings,
    Loader2,
    LayoutGrid,
} from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import type { Board } from '@/types/board'

export default function PodCockpitPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params)
    const router = useRouter()
    const { data: pod, isLoading: podLoading } = usePod(slug)
    const { data: boards = [], isLoading: boardsLoading } = usePodBoards(pod?.id ?? null)
    const updateBoard = useUpdateBoard()
    const deleteBoard = useDeleteBoard()
    const duplicateBoard = useDuplicateBoard()
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    const isLoading = podLoading || boardsLoading

    const handleFavorite = async (board: Board) => {
        await updateBoard.mutateAsync({ id: board.id, is_favorite: !board.is_favorite })
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
        await updateBoard.mutateAsync({ id: board.id, is_archived: !board.is_archived })
        toast.success(board.is_archived ? 'Board unarchived' : 'Board archived')
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
                toast.success('Board deleted')
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete board')
        } finally {
            setDeleteLoading(false)
        }
    }

    if (podLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        )
    }

    if (!pod) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <Layers className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Pod not found</h2>
                <p className="text-muted-foreground mb-4">This pod may have been deleted or the URL is incorrect.</p>
                <Button onClick={() => router.push('/dashboard/cockpit')}>Back to Cockpit</Button>
            </div>
        )
    }

    const color = pod.color || '#6366f1'

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink href="/dashboard/cockpit">Cockpit</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage>{pod.name}</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/dashboard/pods/${slug}/chat`)}
                    >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        Pod Chat
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/dashboard/pods/${slug}/settings`)}
                    >
                        <Settings className="w-4 h-4 mr-1" />
                        Settings
                    </Button>
                </div>
            </header>

            {/* Pod banner */}
            <div className="flex items-center gap-3 pb-4">
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: `${color}20`, color }}
                >
                    {pod.icon || <Layers className="w-5 h-5" />}
                </div>
                <div>
                    <h1 className="text-lg font-bold">{pod.name}</h1>
                    {pod.description && (
                        <p className="text-sm text-muted-foreground">{pod.description}</p>
                    )}
                </div>
                <span className="text-xs text-muted-foreground font-medium bg-accent/50 px-2 py-0.5 rounded ml-auto">
                    {boards.length} board{boards.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Boards grid */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {boardsLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                ) : boards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-12 h-12 rounded-xl bg-accent/50 flex items-center justify-center mb-4">
                            <LayoutGrid className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <h3 className="text-sm font-semibold mb-1">No boards in this pod yet</h3>
                        <p className="text-xs text-muted-foreground max-w-xs mb-4">
                            Assign boards to this pod from the board settings, or create a new board.
                        </p>
                        <Button
                            size="sm"
                            onClick={() => router.push('/dashboard/boards?create=true')}
                        >
                            <Plus className="w-4 h-4 mr-1" />
                            Add a board
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {boards.map((board: Board) => (
                            <BoardCard
                                key={board.id}
                                board={board}
                                onFavorite={handleFavorite}
                                onDuplicate={handleDuplicate}
                                onExport={handleExport}
                                onArchive={handleArchive}
                                onDelete={(b) => setDeleteTarget({ id: b.id, name: b.name })}
                            />
                        ))}
                    </div>
                )}
            </div>

            <ConfirmDeleteDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={confirmDelete}
                title="Delete board?"
                description="This will permanently delete this board and unassign all tasks."
                loading={deleteLoading}
            />
        </div>
    )
}
