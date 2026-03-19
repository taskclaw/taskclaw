'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    ChevronRight,
    Download,
    Archive,
    Trash2,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Circle,
    Plus,
    X,
    Plug,
} from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useBoard, useUpdateBoard, useDeleteBoard } from '@/hooks/use-boards'
import { exportBoard, getBoardIntegrations, removeBoardIntegration } from '@/app/dashboard/boards/actions'
import { BoardSettingsForm } from '@/components/boards/board-settings-form'
import { StepEditor } from '@/components/boards/step-editor'
import { BoardIntegrationDialog } from '@/components/boards/board-integration-dialog'
import { AddIntegrationDialog } from '@/components/boards/add-integration-dialog'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { toast } from 'sonner'
import type { IntegrationStatus } from '@/types/board'

export default function BoardSettingsPage() {
    const params = useParams()
    const router = useRouter()
    const boardId = params.boardId as string
    const { data: board, isLoading } = useBoard(boardId)
    const updateBoard = useUpdateBoard()
    const deleteBoard = useDeleteBoard()
    const [showDelete, setShowDelete] = useState(false)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
    const [selectedIntegration, setSelectedIntegration] = useState<IntegrationStatus | null>(null)
    const [showAddIntegration, setShowAddIntegration] = useState(false)
    const [removingSlug, setRemovingSlug] = useState<string | null>(null)

    const loadIntegrations = useCallback(async () => {
        if (!boardId) return
        const data = await getBoardIntegrations(boardId)
        setIntegrations(data)
    }, [boardId])

    useEffect(() => {
        loadIntegrations()
    }, [loadIntegrations])

    const handleExport = async () => {
        if (!board) return
        const manifest = await exportBoard(board.id)
        if (manifest) {
            const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${board.name.toLowerCase().replace(/\s+/g, '-')}.json`
            a.click()
            URL.revokeObjectURL(url)
            toast.success('Board exported')
        }
    }

    const handleArchive = async () => {
        if (!board) return
        await updateBoard.mutateAsync({
            id: board.id,
            is_archived: !board.is_archived,
        })
        toast.success(board.is_archived ? 'Board unarchived' : 'Board archived')
    }

    const handleDelete = async () => {
        setDeleteLoading(true)
        try {
            const result = await deleteBoard.mutateAsync(boardId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Board deleted')
                router.push('/dashboard/boards')
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete board')
        } finally {
            setDeleteLoading(false)
            setShowDelete(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center flex-1">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!board) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                <p className="text-sm">Board not found</p>
                <button
                    onClick={() => router.push('/dashboard/boards')}
                    className="text-xs text-primary mt-2 hover:underline"
                >
                    Back to boards
                </button>
            </div>
        )
    }

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <nav className="flex items-center gap-1 text-sm">
                        <a
                            href="/dashboard/boards"
                            className="text-muted-foreground hover:text-foreground transition-colors hidden md:block"
                        >
                            Boards
                        </a>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground hidden md:block" />
                        <a
                            href={`/dashboard/boards/${board.id}`}
                            className="text-muted-foreground hover:text-foreground transition-colors hidden md:block"
                        >
                            {board.name}
                        </a>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground hidden md:block" />
                        <span className="font-semibold">Settings</span>
                    </nav>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="max-w-2xl space-y-8 pb-12">
                    {/* Board Details */}
                    <section>
                        <h2 className="text-sm font-bold mb-4">Board Details</h2>
                        <div className="bg-card border border-border rounded-xl p-5">
                            <BoardSettingsForm board={board} />
                        </div>
                    </section>

                    {/* Steps */}
                    <section>
                        <h2 className="text-sm font-bold mb-4">Workflow Steps</h2>
                        <div className="bg-card border border-border rounded-xl p-5">
                            <StepEditor
                                boardId={board.id}
                                steps={board.board_steps || []}
                            />
                        </div>
                    </section>

                    {/* Integrations */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-bold">Integrations</h2>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAddIntegration(true)}
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                Add Integration
                            </Button>
                        </div>

                        {integrations.length > 0 ? (
                            <div className="bg-card border border-border rounded-xl divide-y divide-border">
                                {integrations.map((integration) => (
                                    <div
                                        key={integration.slug}
                                        className="flex items-center gap-3 px-5 py-3.5 group"
                                    >
                                        <button
                                            onClick={() => setSelectedIntegration(integration)}
                                            className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left"
                                        >
                                            <span className="text-xl">{integration.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs font-semibold">{integration.name}</p>
                                                    {integration.required && (
                                                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                                            Required
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-muted-foreground truncate">
                                                    {integration.description}
                                                </p>
                                            </div>
                                        </button>
                                        {integration.enabled && integration.has_config ? (
                                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px] shrink-0">
                                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                                Connected
                                            </Badge>
                                        ) : integration.required ? (
                                            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] shrink-0">
                                                <AlertCircle className="w-3 h-3 mr-1" />
                                                Setup needed
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] shrink-0">
                                                <Circle className="w-3 h-3 mr-1" />
                                                Not configured
                                            </Badge>
                                        )}
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation()
                                                setRemovingSlug(integration.slug)
                                                const result = await removeBoardIntegration(boardId, integration.slug)
                                                if (result.error) {
                                                    toast.error(result.error)
                                                } else {
                                                    toast.success(`${integration.name} removed`)
                                                    loadIntegrations()
                                                }
                                                setRemovingSlug(null)
                                            }}
                                            disabled={removingSlug === integration.slug}
                                            className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                            title="Remove integration"
                                        >
                                            {removingSlug === integration.slug ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <X className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-card border border-dashed border-border rounded-xl p-8 flex flex-col items-center text-center">
                                <Plug className="w-8 h-8 text-muted-foreground/30 mb-3" />
                                <p className="text-xs font-medium text-muted-foreground">No integrations yet</p>
                                <p className="text-[10px] text-muted-foreground/70 mt-1 max-w-xs">
                                    Connect external services like X API, image generators, or CRMs to unlock the full potential of this board.
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-4"
                                    onClick={() => setShowAddIntegration(true)}
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1" />
                                    Add Integration
                                </Button>
                            </div>
                        )}
                    </section>

                    {/* Export */}
                    <section>
                        <h2 className="text-sm font-bold mb-4">Export</h2>
                        <div className="bg-card border border-border rounded-xl p-5">
                            <p className="text-xs text-muted-foreground mb-3">
                                Export this board as a JSON manifest. This includes all step definitions but no task data.
                            </p>
                            <Button variant="outline" size="sm" onClick={handleExport}>
                                <Download className="w-4 h-4 mr-1" />
                                Export as JSON
                            </Button>
                        </div>
                    </section>

                    {/* Danger Zone */}
                    <section>
                        <h2 className="text-sm font-bold mb-4 text-destructive">Danger Zone</h2>
                        <div className="bg-card border border-destructive/30 rounded-xl p-5 space-y-4">
                            {/* Archive */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold">
                                        {board.is_archived ? 'Unarchive Board' : 'Archive Board'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {board.is_archived
                                            ? 'This will restore the board to the active list.'
                                            : 'This will hide the board from the sidebar and active list.'}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleArchive}
                                    disabled={updateBoard.isPending}
                                >
                                    <Archive className="w-4 h-4 mr-1" />
                                    {board.is_archived ? 'Unarchive' : 'Archive'}
                                </Button>
                            </div>

                            <Separator />

                            {/* Delete */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold">Delete Board</p>
                                    <p className="text-xs text-muted-foreground">
                                        Permanently delete this board. Tasks will become unassigned.
                                    </p>
                                </div>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => setShowDelete(true)}
                                >
                                    <Trash2 className="w-4 h-4 mr-1" />
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <ConfirmDeleteDialog
                open={showDelete}
                onOpenChange={setShowDelete}
                onConfirm={handleDelete}
                title="Delete board?"
                description="This will permanently delete this board. All tasks will become unassigned. This action cannot be undone."
                loading={deleteLoading}
            />

            {selectedIntegration && (
                <BoardIntegrationDialog
                    integration={selectedIntegration}
                    boardId={boardId}
                    open={!!selectedIntegration}
                    onOpenChange={(open) => {
                        if (!open) setSelectedIntegration(null)
                    }}
                    onSaved={loadIntegrations}
                />
            )}

            <AddIntegrationDialog
                boardId={boardId}
                existingSlugs={integrations.map((i) => i.slug)}
                open={showAddIntegration}
                onOpenChange={setShowAddIntegration}
                onAdded={loadIntegrations}
            />
        </div>
    )
}
