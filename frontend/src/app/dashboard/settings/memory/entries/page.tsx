'use client'

import { useState, useEffect, useCallback } from 'react'
import { getMemoryEntries, deleteMemoryEntry, type MemoryEntry, type MemoryType } from '../actions'
import { Brain, Trash2, ChevronLeft, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const TYPE_FILTERS: { label: string; value: MemoryType | 'all' }[] = [
    { label: 'All', value: 'all' },
    { label: 'Episodic', value: 'episodic' },
    { label: 'Semantic', value: 'semantic' },
    { label: 'Procedural', value: 'procedural' },
]

function typeBadgeClass(type: MemoryType): string {
    switch (type) {
        case 'episodic':
            return 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20'
        case 'semantic':
            return 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20'
        case 'procedural':
            return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20'
        case 'working':
            return 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/20'
        default:
            return ''
    }
}

function sourceBadgeClass(source: string): string {
    switch (source) {
        case 'agent':
            return 'bg-primary/10 text-primary border-primary/20'
        case 'human':
            return 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20'
        case 'sync':
            return 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/20'
        default:
            return ''
    }
}

export default function MemoryEntriesPage() {
    const [entries, setEntries] = useState<MemoryEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [activeFilter, setActiveFilter] = useState<MemoryType | 'all'>('all')
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; content: string } | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    const loadEntries = useCallback(async () => {
        setLoading(true)
        try {
            const data = await getMemoryEntries({
                type: activeFilter === 'all' ? undefined : activeFilter,
                limit: 100,
            })
            setEntries(data || [])
        } catch {
            setEntries([])
        } finally {
            setLoading(false)
        }
    }, [activeFilter])

    useEffect(() => {
        loadEntries()
    }, [loadEntries])

    const handleDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const result = await deleteMemoryEntry(deleteTarget.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Memory deleted')
                setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id))
                setDeleteTarget(null)
            }
        } finally {
            setDeleteLoading(false)
        }
    }

    return (
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 max-w-3xl">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link href="/dashboard/settings/memory">
                    <Button variant="ghost" size="sm" className="gap-1">
                        <ChevronLeft className="w-4 h-4" />
                        Memory settings
                    </Button>
                </Link>
            </div>

            <div>
                <h2 className="text-2xl font-bold tracking-tight">Memory Entries</h2>
                <p className="text-muted-foreground text-sm">
                    All memories stored by AI agents across your conversations.
                </p>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 border-b">
                {TYPE_FILTERS.map((f) => (
                    <button
                        key={f.value}
                        onClick={() => setActiveFilter(f.value)}
                        className={cn(
                            'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                            activeFilter === f.value
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading memories...
                </div>
            ) : entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <Brain className="w-10 h-10 text-muted-foreground/30" />
                    <div>
                        <p className="font-medium text-sm">No memories yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Memories are extracted automatically after AI conversations.
                        </p>
                    </div>
                </div>
            ) : (
                <TooltipProvider>
                    <div className="space-y-2">
                        {entries.map((entry) => (
                            <div
                                key={entry.id}
                                className="border rounded-lg p-3 bg-card flex items-start gap-3 group"
                            >
                                {/* Type + source badges */}
                                <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                                    <Badge
                                        variant="outline"
                                        className={cn('text-[10px] px-1.5 py-0', typeBadgeClass(entry.type))}
                                    >
                                        {entry.type}
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className={cn('text-[10px] px-1.5 py-0', sourceBadgeClass(entry.source))}
                                    >
                                        {entry.source}
                                    </Badge>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <p className="text-sm leading-snug cursor-default line-clamp-2">
                                                {entry.content.length > 80
                                                    ? entry.content.slice(0, 80) + '…'
                                                    : entry.content}
                                            </p>
                                        </TooltipTrigger>
                                        {entry.content.length > 80 && (
                                            <TooltipContent
                                                side="top"
                                                className="max-w-sm text-xs whitespace-pre-wrap"
                                            >
                                                {entry.content}
                                            </TooltipContent>
                                        )}
                                    </Tooltip>

                                    {/* Salience + timestamp */}
                                    <div className="flex items-center gap-3 mt-2">
                                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            <span className="text-[10px] text-muted-foreground shrink-0">
                                                Salience
                                            </span>
                                            <Progress
                                                value={Math.round(entry.salience * 100)}
                                                className="h-1 flex-1 max-w-[80px]"
                                            />
                                            <span className="text-[10px] text-muted-foreground shrink-0">
                                                {Math.round(entry.salience * 100)}%
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                            {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                                        </span>
                                    </div>
                                </div>

                                {/* Delete */}
                                <button
                                    onClick={() => setDeleteTarget({ id: entry.id, content: entry.content })}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground shrink-0"
                                    title="Delete memory"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </TooltipProvider>
            )}

            <ConfirmDeleteDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={handleDelete}
                title="Delete memory?"
                description="This memory will be permanently removed. The AI will no longer recall this information."
                loading={deleteLoading}
            />
        </div>
    )
}
