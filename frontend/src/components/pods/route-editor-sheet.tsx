'use client'

import { useState } from 'react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createBoardRoute, deleteBoardRoute } from '@/app/dashboard/pods/actions'
import type { BoardRoute } from '@/types/pod'
import type { Board } from '@/types/board'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { cn } from '@/lib/utils'

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

type TriggerType = 'auto' | 'manual' | 'ai_decision'

const TRIGGER_OPTIONS: { value: TriggerType; label: string; description: string; color: string }[] = [
    {
        value: 'auto',
        label: 'Auto',
        description: 'Triggers automatically when task completes / moves to done step',
        color: 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/30',
    },
    {
        value: 'manual',
        label: 'Manual',
        description: 'Requires a human to trigger the route',
        color: 'text-slate-600 dark:text-slate-400 bg-slate-500/10 border-slate-500/30',
    },
    {
        value: 'ai_decision',
        label: 'AI Decision',
        description: 'The AI agent decides whether to trigger this route',
        color: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/30',
    },
]

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
                <SheetContent className="w-[400px] sm:w-[440px] overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>{isEditing ? 'Edit Route' : 'Create Route'}</SheetTitle>
                        <SheetDescription>
                            {sourceBoard?.name && targetBoard?.name
                                ? `${sourceBoard.name} → ${targetBoard.name}`
                                : 'Configure how tasks flow between boards.'}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="mt-6 space-y-5 px-1">
                        {/* Trigger type */}
                        <div className="space-y-2">
                            <Label className="text-xs">Trigger type</Label>
                            <div className="space-y-2">
                                {TRIGGER_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setTrigger(opt.value)}
                                        className={cn(
                                            'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                                            trigger === opt.value
                                                ? opt.color
                                                : 'border-border hover:bg-accent/30',
                                        )}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold">{opt.label}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                                                {opt.description}
                                            </p>
                                        </div>
                                        <div
                                            className={cn(
                                                'w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 transition-colors',
                                                trigger === opt.value ? 'border-current bg-current' : 'border-border',
                                            )}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Source step selector */}
                        {sourceSteps.length > 0 && (
                            <div className="space-y-1.5">
                                <Label className="text-xs">
                                    Source step
                                    <span className="text-muted-foreground ml-1">(optional)</span>
                                </Label>
                                <select
                                    value={sourceStepId}
                                    onChange={(e) => setSourceStepId(e.target.value)}
                                    className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                    <option value="">Any step (board level)</option>
                                    {sourceSteps.map((step) => (
                                        <option key={step.id} value={step.id}>
                                            {step.name}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-muted-foreground">
                                    Leave blank to trigger from any step in {sourceBoard?.name}
                                </p>
                            </div>
                        )}

                        {/* Target step selector */}
                        {targetSteps.length > 0 && (
                            <div className="space-y-1.5">
                                <Label className="text-xs">
                                    Target step
                                    <span className="text-muted-foreground ml-1">(optional)</span>
                                </Label>
                                <select
                                    value={targetStepId}
                                    onChange={(e) => setTargetStepId(e.target.value)}
                                    className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                    <option value="">First step (default)</option>
                                    {targetSteps.map((step) => (
                                        <option key={step.id} value={step.id}>
                                            {step.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Label */}
                        <div className="space-y-1.5">
                            <Label htmlFor="route-label" className="text-xs">
                                Label
                                <span className="text-muted-foreground ml-1">(optional)</span>
                            </Label>
                            <Input
                                id="route-label"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="e.g. Escalate to review"
                                className="h-8 text-sm"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                            <Button
                                size="sm"
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1"
                            >
                                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
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
