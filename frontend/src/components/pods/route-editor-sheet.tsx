'use client'

import { useState } from 'react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Trash2, ArrowRight, Zap, Bot, Hand, AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { createBoardRoute, deleteBoardRoute } from '@/app/dashboard/pods/actions'
import type { BoardRoute } from '@/types/pod'
import type { Board } from '@/types/board'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { cn } from '@/lib/utils'
import { BoardIcon } from '@/lib/board-icon'

interface RouteEditorSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    sourceBoard: Board | null
    targetBoard: Board | null
    podId?: string
    existingRoute?: BoardRoute | null
    onSaved: (route: BoardRoute) => void
    onDeleted: (routeId: string) => void
}

type TriggerType = 'auto' | 'manual' | 'ai_decision' | 'error' | 'fallback'

interface TriggerOption {
    value: TriggerType
    label: string
    description: string
    icon: React.ElementType
    color: string
    dotColor: string
}

const TRIGGER_OPTIONS: TriggerOption[] = [
    {
        value: 'auto',
        label: 'Auto',
        description: 'Fires when task completes / moves to done step',
        icon: Zap,
        color: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400',
        dotColor: 'bg-green-500',
    },
    {
        value: 'manual',
        label: 'Manual',
        description: 'Human clicks "Send to Board" on the task card',
        icon: Hand,
        color: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
        dotColor: 'bg-slate-400',
    },
    {
        value: 'ai_decision',
        label: 'AI Decision',
        description: 'The AI agent decides whether to trigger this route',
        icon: Bot,
        color: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400',
        dotColor: 'bg-purple-500',
    },
    {
        value: 'error',
        label: 'Error',
        description: 'Triggers when a task encounters an error or failure',
        icon: AlertTriangle,
        color: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
        dotColor: 'bg-red-500',
    },
    {
        value: 'fallback',
        label: 'Fallback',
        description: 'Fallback when no other route matches or succeeds',
        icon: RefreshCw,
        color: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400',
        dotColor: 'bg-orange-500',
    },
]

function BoardMiniCard({ board, step }: { board: Board; step?: string }) {
    const color = board.color || '#6366f1'
    return (
        <div
            className="flex-1 rounded-lg border bg-card overflow-hidden"
            style={{ borderColor: `${color}40` }}
        >
            <div className="h-0.5 w-full" style={{ backgroundColor: color }} />
            <div className="flex items-center gap-2 p-2.5">
                <div
                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${color}20`, color }}
                >
                    <BoardIcon name={board.icon} className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-semibold truncate leading-tight">{board.name}</p>
                    {step && (
                        <p className="text-[10px] text-muted-foreground truncate">→ {step}</p>
                    )}
                </div>
            </div>
        </div>
    )
}

export function RouteEditorSheet({
    open,
    onOpenChange,
    sourceBoard,
    targetBoard,
    podId,
    existingRoute,
    onSaved,
    onDeleted,
}: RouteEditorSheetProps) {
    const isEditing = !!existingRoute

    const [trigger, setTrigger] = useState<TriggerType>(
        (existingRoute?.trigger as TriggerType) || 'auto'
    )
    const [sourceStepId, setSourceStepId] = useState<string>(
        existingRoute?.source_step_id || ''
    )
    const [targetStepId, setTargetStepId] = useState<string>(
        existingRoute?.target_step_id || ''
    )
    const [label, setLabel] = useState<string>(existingRoute?.label || '')
    const [saving, setSaving] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteLoading, setDeleteLoading] = useState(false)

    const sourceSteps = sourceBoard?.board_steps || []
    const targetSteps = targetBoard?.board_steps || []

    const selectedTrigger = TRIGGER_OPTIONS.find((o) => o.value === trigger)!
    const selectedSourceStep = sourceSteps.find((s) => s.id === sourceStepId)
    const selectedTargetStep = targetSteps.find((s) => s.id === targetStepId)

    async function handleSave() {
        if (!sourceBoard || !targetBoard) {
            toast.error('Source and target boards are required')
            return
        }
        setSaving(true)
        try {
            const payload: Partial<BoardRoute> = {
                source_board_id: sourceBoard.id,
                target_board_id: targetBoard.id,
                source_step_id: sourceStepId || null,
                target_step_id: targetStepId || null,
                trigger,
                label: label || null,
                is_active: true,
                ...(podId ? { pod_id: podId } : {}),
            }

            const result = await createBoardRoute(payload)
            if (result.error) {
                toast.error(result.error)
            } else if (result.route) {
                toast.success(`Route ${isEditing ? 'updated' : 'created'}`)
                onSaved(result.route)
            }
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete() {
        if (!existingRoute) return
        setDeleteLoading(true)
        try {
            const result = await deleteBoardRoute(existingRoute.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Route deleted')
                onDeleted(existingRoute.id)
            }
        } finally {
            setDeleteLoading(false)
        }
    }

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent className="w-[420px] sm:w-[440px] overflow-y-auto p-0 flex flex-col">
                    {/* Header */}
                    <SheetHeader className="px-5 pt-5 pb-4 border-b bg-card">
                        <SheetTitle className="text-base">
                            {isEditing ? 'Edit Route' : 'Create Route'}
                        </SheetTitle>

                        {/* Board flow preview */}
                        {sourceBoard && targetBoard && (
                            <div className="flex items-center gap-2 mt-3">
                                <BoardMiniCard
                                    board={sourceBoard}
                                    step={selectedSourceStep?.name}
                                />
                                <div className="flex flex-col items-center gap-0.5 shrink-0">
                                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', selectedTrigger.color)}>
                                        <selectedTrigger.icon className="w-3.5 h-3.5" />
                                    </div>
                                    <span className={cn('text-[9px] font-semibold', selectedTrigger.color.split(' ').filter(c => c.startsWith('text-'))[0])}>
                                        {selectedTrigger.label}
                                    </span>
                                </div>
                                <BoardMiniCard
                                    board={targetBoard}
                                    step={selectedTargetStep?.name}
                                />
                            </div>
                        )}
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                        {/* Trigger type */}
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Trigger type
                            </Label>
                            <div className="grid grid-cols-1 gap-1.5">
                                {TRIGGER_OPTIONS.map((opt) => {
                                    const Icon = opt.icon
                                    const isSelected = trigger === opt.value
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => setTrigger(opt.value)}
                                            className={cn(
                                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
                                                isSelected
                                                    ? opt.color
                                                    : 'border-border hover:bg-accent/40 hover:border-border/80',
                                            )}
                                        >
                                            <div className={cn(
                                                'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                                                isSelected ? 'bg-current/10' : 'bg-accent',
                                            )}>
                                                <Icon className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold leading-tight">{opt.label}</p>
                                                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                                                    {opt.description}
                                                </p>
                                            </div>
                                            <div className={cn(
                                                'w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-all',
                                                isSelected ? `${opt.dotColor} border-current` : 'border-border',
                                            )} />
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Step selectors — shown as pill grids instead of bare selects */}
                        {sourceSteps.length > 0 && (
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    From step
                                    <span className="text-muted-foreground/60 normal-case font-normal ml-1">(optional)</span>
                                </Label>
                                <div className="flex flex-wrap gap-1.5">
                                    <button
                                        onClick={() => setSourceStepId('')}
                                        className={cn(
                                            'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                                            sourceStepId === ''
                                                ? 'bg-primary/15 border-primary/30 text-primary'
                                                : 'border-border hover:bg-accent/50',
                                        )}
                                    >
                                        Any step
                                    </button>
                                    {sourceSteps.map((step) => (
                                        <button
                                            key={step.id}
                                            onClick={() => setSourceStepId(step.id)}
                                            className={cn(
                                                'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                                                sourceStepId === step.id
                                                    ? 'bg-primary/15 border-primary/30 text-primary'
                                                    : 'border-border hover:bg-accent/50',
                                            )}
                                            style={sourceStepId === step.id && step.color
                                                ? { backgroundColor: `${step.color}20`, borderColor: `${step.color}50`, color: step.color }
                                                : undefined
                                            }
                                        >
                                            {step.name}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    Leave on &quot;Any step&quot; to trigger from anywhere in {sourceBoard?.name}
                                </p>
                            </div>
                        )}

                        {targetSteps.length > 0 && (
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    To step
                                    <span className="text-muted-foreground/60 normal-case font-normal ml-1">(optional)</span>
                                </Label>
                                <div className="flex flex-wrap gap-1.5">
                                    <button
                                        onClick={() => setTargetStepId('')}
                                        className={cn(
                                            'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                                            targetStepId === ''
                                                ? 'bg-primary/15 border-primary/30 text-primary'
                                                : 'border-border hover:bg-accent/50',
                                        )}
                                    >
                                        First step
                                    </button>
                                    {targetSteps.map((step) => (
                                        <button
                                            key={step.id}
                                            onClick={() => setTargetStepId(step.id)}
                                            className={cn(
                                                'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                                                targetStepId === step.id
                                                    ? 'bg-primary/15 border-primary/30 text-primary'
                                                    : 'border-border hover:bg-accent/50',
                                            )}
                                            style={targetStepId === step.id && step.color
                                                ? { backgroundColor: `${step.color}20`, borderColor: `${step.color}50`, color: step.color }
                                                : undefined
                                            }
                                        >
                                            {step.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Label */}
                        <div className="space-y-1.5">
                            <Label htmlFor="route-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Label
                                <span className="text-muted-foreground/60 normal-case font-normal ml-1">(optional)</span>
                            </Label>
                            <Input
                                id="route-label"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="e.g. Escalate to review"
                                className="h-8 text-sm"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Shows as the edge label on the canvas
                            </p>
                        </div>
                    </div>

                    {/* Footer actions */}
                    <div className="px-5 py-4 border-t bg-card/50 flex gap-2 shrink-0">
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={saving || !sourceBoard || !targetBoard}
                            className="flex-1"
                        >
                            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                            <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                            {isEditing ? 'Update route' : 'Create route'}
                        </Button>
                        {isEditing && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeleteOpen(true)}
                                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            <ConfirmDeleteDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                onConfirm={handleDelete}
                title="Delete route?"
                description="This board route will be permanently removed. Tasks won't auto-transfer between these boards anymore."
                loading={deleteLoading}
            />
        </>
    )
}
