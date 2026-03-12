'use client'

import { useState, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
    Plus,
    Search,
    Upload,
    LayoutGrid,
    Star,
    Clock,
    Layers,
    Archive,
} from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBoards, useUpdateBoard, useDeleteBoard, useDuplicateBoard, useCreateBoard } from '@/hooks/use-boards'
import { exportBoard, importManifest } from '@/app/dashboard/boards/actions'
import { BoardCard } from '@/components/boards/board-card'
import { CreateBoardDialog } from '@/components/boards/create-board-dialog'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { ViewToggle } from '@/components/view-toggle'
import type { Board } from '@/types/board'
import { BoardIcon } from '@/lib/board-icon'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type FilterTab = 'all' | 'active' | 'archived'

export default function BoardsPage() {
    const searchParams = useSearchParams()
    const { data: boards = [], isLoading } = useBoards()
    const updateBoard = useUpdateBoard()
    const deleteBoard = useDeleteBoard()
    const duplicateBoard = useDuplicateBoard()
    const createBoard = useCreateBoard()

    const [search, setSearch] = useState('')
    const [tab, setTab] = useState<FilterTab>('active')
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [showCreate, setShowCreate] = useState(searchParams.get('create') === 'true')
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Filter boards
    const filteredBoards = useMemo(() => {
        let result = boards

        // Tab filter
        if (tab === 'active') result = result.filter((b) => !b.is_archived)
        else if (tab === 'archived') result = result.filter((b) => b.is_archived)

        // Search
        if (search.trim()) {
            const q = search.toLowerCase()
            result = result.filter(
                (b) =>
                    b.name.toLowerCase().includes(q) ||
                    b.description?.toLowerCase().includes(q) ||
                    b.tags?.some((t) => t.toLowerCase().includes(q)),
            )
        }

        return result
    }, [boards, tab, search])

    // Actions
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
            is_archived: !board.is_archived,
        })
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

    const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        try {
            const text = await file.text()
            const manifest = JSON.parse(text)

            // Full manifest import (with categories, skills, rich config)
            if (manifest.categories?.length || manifest.manifest_version) {
                const result = await importManifest(manifest)
                if (result.error) {
                    toast.error(result.error)
                } else {
                    toast.success(`Board "${manifest.name}" imported with ${manifest.categories?.length || 0} categories and ${manifest.steps?.length || 0} steps`)
                }
            } else {
                // Simple import (steps only, no categories)
                const steps = manifest.steps?.map((s: any) => ({
                    step_key: s.id || s.name.toLowerCase().replace(/\s+/g, '_'),
                    name: s.name,
                    step_type: s.type,
                    color: s.color,
                })) || []

                const result = await createBoard.mutateAsync({
                    name: manifest.name || file.name.replace('.json', ''),
                    description: manifest.description,
                    steps,
                })

                if (result.error) {
                    toast.error(result.error)
                } else {
                    toast.success('Board imported from JSON')
                }
            }
        } catch {
            toast.error('Invalid JSON file')
        }
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const tabs: { key: FilterTab; label: string; icon: React.ReactNode }[] = [
        { key: 'all', label: 'All', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
        { key: 'active', label: 'Active', icon: <Layers className="w-3.5 h-3.5" /> },
        { key: 'archived', label: 'Archived', icon: <Archive className="w-3.5 h-3.5" /> },
    ]

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Page Header */}
            <header className="flex h-16 shrink-0 items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <h1 className="text-lg font-bold">Boards</h1>
                    <span className="text-xs text-muted-foreground font-medium bg-accent/50 px-2 py-0.5 rounded">
                        {boards.length}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImportJSON}
                        className="hidden"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="w-4 h-4 mr-1" />
                        Import
                    </Button>
                    <Button size="sm" onClick={() => setShowCreate(true)}>
                        <Plus className="w-4 h-4 mr-1" />
                        New Board
                    </Button>
                </div>
            </header>

            {/* Toolbar: search + tabs + view toggle */}
            <div className="flex items-center gap-3 pb-4 flex-wrap">
                {/* Search */}
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search boards..."
                        className="pl-9 h-8 text-xs"
                    />
                </div>

                {/* Filter tabs */}
                <div className="flex items-center gap-1 bg-accent/30 rounded-lg p-0.5">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                                tab === t.key
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t.icon}
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Spacer + count + view toggle */}
                <div className="ml-auto flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                        {filteredBoards.length} board{filteredBoards.length !== 1 ? 's' : ''}
                    </span>
                    <ViewToggle mode={viewMode} onChange={setViewMode} />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                ) : filteredBoards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-12 h-12 rounded-xl bg-accent/50 flex items-center justify-center mb-4">
                            <LayoutGrid className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <h3 className="text-sm font-semibold mb-1">
                            {tab === 'archived' ? 'No archived boards' : search ? 'No boards found' : 'No boards yet'}
                        </h3>
                        <p className="text-xs text-muted-foreground max-w-xs mb-4">
                            {tab === 'archived'
                                ? 'Archived boards will appear here.'
                                : search
                                    ? 'Try a different search term.'
                                    : 'Create your first board to start organizing tasks with custom workflows.'}
                        </p>
                        {!search && tab !== 'archived' && (
                            <Button size="sm" onClick={() => setShowCreate(true)}>
                                <Plus className="w-4 h-4 mr-1" />
                                Create Board
                            </Button>
                        )}
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filteredBoards.map((board) => (
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
                ) : (
                    <div className="rounded-lg border border-border bg-card overflow-hidden">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-border text-muted-foreground">
                                    <th className="text-left px-4 py-3 font-medium">Board</th>
                                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Steps</th>
                                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Cards</th>
                                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Updated</th>
                                    <th className="text-right px-4 py-3 font-medium w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredBoards.map((board) => {
                                    const color = board.color || '#6366f1'
                                    return (
                                        <tr
                                            key={board.id}
                                            onClick={() => window.location.href = `/dashboard/boards/${board.id}`}
                                            className="border-b border-border last:border-0 hover:bg-accent/30 cursor-pointer transition-colors group"
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-xs"
                                                        style={{
                                                            backgroundColor: `${color}20`,
                                                            color,
                                                        }}
                                                    >
                                                        <BoardIcon name={board.icon} className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-semibold truncate">{board.name}</span>
                                                            {board.is_favorite && (
                                                                <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                                                            )}
                                                        </div>
                                                        {board.description && (
                                                            <p className="text-muted-foreground truncate max-w-xs">
                                                                {board.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                                                {board.board_steps?.length || 0}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                                                {board.task_count || 0}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                                                {new Date(board.updated_at).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                })}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleFavorite(board)
                                                    }}
                                                    className={cn(
                                                        'p-1 rounded transition-colors',
                                                        board.is_favorite
                                                            ? 'text-amber-400'
                                                            : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-amber-400',
                                                    )}
                                                >
                                                    <Star className={cn('w-3.5 h-3.5', board.is_favorite && 'fill-amber-400')} />
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create Board Dialog */}
            <CreateBoardDialog
                open={showCreate}
                onClose={() => setShowCreate(false)}
            />

            {/* Delete Confirmation */}
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
