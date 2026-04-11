'use client'

import { useState, useMemo } from 'react'
import { Search, Check, Loader2, Layers } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAllBoards, useAssignBoardToPod } from '@/hooks/use-pods'
import { toast } from 'sonner'
import type { Board } from '@/types/board'

interface AssignBoardsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    podId: string
    podName: string
    /** IDs of boards already in this pod — to pre-select / exclude */
    existingBoardIds: string[]
}

export function AssignBoardsDialog({
    open,
    onOpenChange,
    podId,
    podName,
    existingBoardIds,
}: AssignBoardsDialogProps) {
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [saving, setSaving] = useState(false)

    const { data: allBoards = [], isLoading } = useAllBoards()
    const assignBoard = useAssignBoardToPod()

    // Only show boards not already in this pod
    const available = useMemo(() => {
        const q = search.toLowerCase()
        return (allBoards as Board[]).filter(
            (b) =>
                !existingBoardIds.includes(b.id) &&
                !b.is_archived &&
                (b.name.toLowerCase().includes(q) || (b.description ?? '').toLowerCase().includes(q))
        )
    }, [allBoards, existingBoardIds, search])

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleAssign = async () => {
        if (selected.size === 0) return
        setSaving(true)
        let ok = 0
        for (const boardId of selected) {
            const res = await assignBoard.mutateAsync({ boardId, podId })
            if (res.success) ok++
            else toast.error(`Failed to assign board: ${res.error}`)
        }
        setSaving(false)
        if (ok > 0) {
            toast.success(`${ok} board${ok > 1 ? 's' : ''} added to ${podName}`)
            setSelected(new Set())
            setSearch('')
            onOpenChange(false)
        }
    }

    const handleClose = () => {
        setSelected(new Set())
        setSearch('')
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-sm">Add boards to {podName}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Select existing boards to include in this pod. The boards will appear in the pod workflow.
                    </DialogDescription>
                </DialogHeader>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search boards…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 text-sm"
                        autoFocus
                    />
                </div>

                {/* Board list */}
                <div className="flex-1 overflow-y-auto space-y-1 min-h-0 pr-1">
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : available.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                            <Layers className="w-8 h-8 mb-2 opacity-40" />
                            <p className="text-xs">
                                {search ? 'No boards match your search' : 'All boards are already in this pod'}
                            </p>
                        </div>
                    ) : (
                        available.map((board) => {
                            const isSelected = selected.has(board.id)
                            return (
                                <button
                                    key={board.id}
                                    onClick={() => toggle(board.id)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors text-sm ${
                                        isSelected
                                            ? 'bg-primary/10 border border-primary/30'
                                            : 'hover:bg-accent border border-transparent'
                                    }`}
                                >
                                    {/* Board icon */}
                                    <div
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                                        style={{
                                            backgroundColor: `${board.color || '#6366f1'}20`,
                                            border: `1px solid ${board.color || '#6366f1'}40`,
                                        }}
                                    >
                                        {board.icon || '📋'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{board.name}</p>
                                        {board.description && (
                                            <p className="text-xs text-muted-foreground truncate">{board.description}</p>
                                        )}
                                    </div>
                                    {/* Checkmark */}
                                    <div
                                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                            isSelected
                                                ? 'bg-primary border-primary text-primary-foreground'
                                                : 'border-muted-foreground/30'
                                        }`}
                                    >
                                        {isSelected && <Check className="w-3 h-3" />}
                                    </div>
                                </button>
                            )
                        })
                    )}
                </div>

                <DialogFooter className="flex items-center justify-between pt-2 gap-2">
                    <p className="text-xs text-muted-foreground">
                        {selected.size > 0
                            ? `${selected.size} board${selected.size > 1 ? 's' : ''} selected`
                            : 'Select boards to add'}
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleAssign}
                            disabled={selected.size === 0 || saving}
                        >
                            {saving && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                            Add {selected.size > 0 ? `${selected.size} board${selected.size > 1 ? 's' : ''}` : 'boards'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
