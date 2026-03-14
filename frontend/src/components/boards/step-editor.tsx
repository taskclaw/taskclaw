'use client'

import { useState } from 'react'
import { Plus, GripVertical, Trash2, Loader2, Link2, Unlink, Sparkles, Settings2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBoardStep, updateBoardStep, deleteBoardStep } from '@/app/dashboard/boards/actions'
import { getCategories } from '@/app/dashboard/settings/categories/actions'
import type { BoardStep } from '@/types/board'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { StepConfigDrawer } from './step-config-drawer'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STEP_COLORS = [
    '#71717a', '#3b82f6', '#8b5cf6', '#ec4899',
    '#ef4444', '#f97316', '#eab308', '#22c55e',
]

interface StepEditorProps {
    boardId: string
    steps: BoardStep[]
}

export function StepEditor({ boardId, steps }: StepEditorProps) {
    const qc = useQueryClient()
    const [newStepName, setNewStepName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editValue, setEditValue] = useState('')
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [categoryPickerOpen, setCategoryPickerOpen] = useState<string | null>(null)
    const [configStep, setConfigStep] = useState<BoardStep | null>(null)

    const { data: categories = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: () => getCategories(),
    })

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['board', boardId] })
        qc.invalidateQueries({ queryKey: ['boards'] })
    }

    const addStep = useMutation({
        mutationFn: async () => {
            const name = newStepName.trim()
            if (!name) return
            const result = await createBoardStep(boardId, {
                step_key: name.toLowerCase().replace(/\s+/g, '_'),
                name,
                position: steps.length,
            })
            if (result.error) throw new Error(result.error)
            return result
        },
        onSuccess: () => {
            setNewStepName('')
            invalidate()
        },
        onError: (e: Error) => toast.error(e.message),
    })

    const renameStep = useMutation({
        mutationFn: async ({ stepId, name }: { stepId: string; name: string }) => {
            const result = await updateBoardStep(boardId, stepId, { name })
            if (result.error) throw new Error(result.error)
            return result
        },
        onSuccess: () => {
            setEditingId(null)
            invalidate()
        },
        onError: (e: Error) => toast.error(e.message),
    })

    const changeColor = useMutation({
        mutationFn: async ({ stepId, color }: { stepId: string; color: string }) => {
            const result = await updateBoardStep(boardId, stepId, { color })
            if (result.error) throw new Error(result.error)
            return result
        },
        onSuccess: () => invalidate(),
        onError: (e: Error) => toast.error(e.message),
    })

    const linkCategory = useMutation({
        mutationFn: async ({ stepId, categoryId }: { stepId: string; categoryId: string | null }) => {
            const result = await updateBoardStep(boardId, stepId, { linked_category_id: categoryId })
            if (result.error) throw new Error(result.error)
            return result
        },
        onSuccess: () => {
            setCategoryPickerOpen(null)
            invalidate()
            toast.success('Category link updated')
        },
        onError: (e: Error) => toast.error(e.message),
    })

    const removeStep = useMutation({
        mutationFn: async (stepId: string) => {
            setDeletingId(stepId)
            const result = await deleteBoardStep(boardId, stepId)
            if (result.error) throw new Error(result.error)
            return result
        },
        onSuccess: () => {
            setDeletingId(null)
            invalidate()
            toast.success('Step deleted')
        },
        onError: (e: Error) => {
            setDeletingId(null)
            toast.error(e.message)
        },
    })

    const startEditing = (step: BoardStep) => {
        setEditingId(step.id)
        setEditValue(step.name)
    }

    const saveRename = (stepId: string) => {
        const name = editValue.trim()
        if (!name) {
            setEditingId(null)
            return
        }
        renameStep.mutate({ stepId, name })
    }

    // Count configured fields for a step
    const getConfigCount = (step: BoardStep) => {
        let count = 0
        if (step.trigger_type && step.trigger_type !== 'on_entry') count++
        if (step.ai_first) count++
        if (step.input_schema?.length > 0) count++
        if (step.output_schema?.length > 0) count++
        if (step.on_success_step_id) count++
        if (step.on_error_step_id) count++
        return count
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Steps ({steps.length})
                </h3>
            </div>

            <div className="space-y-2">
                {steps.map((step) => {
                    const configCount = getConfigCount(step)
                    return (
                        <div key={step.id} className="space-y-1">
                            {/* Step Row */}
                            <div
                                className={cn(
                                    'flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-accent/20 group',
                                    deletingId === step.id && 'opacity-50',
                                )}
                            >
                                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 cursor-grab" />

                                {/* Color picker */}
                                <div className="relative group/color">
                                    <button
                                        className="w-3 h-3 rounded-full shrink-0 border border-white/10"
                                        style={{ backgroundColor: step.color || '#71717a' }}
                                    />
                                    <div className="absolute left-0 top-full mt-1 hidden group-hover/color:flex gap-1 p-1.5 bg-popover border border-border rounded-lg shadow-lg z-10">
                                        {STEP_COLORS.map((c) => (
                                            <button
                                                key={c}
                                                onClick={() => changeColor.mutate({ stepId: step.id, color: c })}
                                                className="w-4 h-4 rounded-full border border-white/10 hover:scale-125 transition-transform"
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Name */}
                                {editingId === step.id ? (
                                    <Input
                                        autoFocus
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveRename(step.id)
                                            if (e.key === 'Escape') setEditingId(null)
                                        }}
                                        onBlur={() => saveRename(step.id)}
                                        className="h-6 text-xs flex-1"
                                    />
                                ) : (
                                    <span
                                        onClick={() => startEditing(step)}
                                        className="text-xs font-medium flex-1 cursor-pointer hover:text-primary transition-colors"
                                    >
                                        {step.name}
                                    </span>
                                )}

                                {/* Linked category badge */}
                                {step.linked_category && (
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Sparkles className="w-3 h-3 text-primary" />
                                        <span className="text-[9px] text-primary font-medium truncate max-w-[80px]">
                                            {step.linked_category.name}
                                        </span>
                                    </div>
                                )}

                                {/* Step type badge */}
                                <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider shrink-0">
                                    {step.step_type}
                                </span>

                                {/* Config button */}
                                <button
                                    onClick={() => setConfigStep(step)}
                                    className={cn(
                                        'p-1 transition-all shrink-0 relative',
                                        configCount > 0
                                            ? 'text-primary hover:text-primary/80'
                                            : 'text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100',
                                    )}
                                    title="Configure step"
                                >
                                    <Settings2 className="w-3.5 h-3.5" />
                                    {configCount > 0 && (
                                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary text-[7px] text-white flex items-center justify-center font-bold">
                                            {configCount}
                                        </span>
                                    )}
                                </button>

                                {/* Category link toggle */}
                                <div className="relative">
                                    <button
                                        onClick={() => setCategoryPickerOpen(
                                            categoryPickerOpen === step.id ? null : step.id
                                        )}
                                        className={cn(
                                            'p-1 transition-all shrink-0',
                                            step.linked_category_id
                                                ? 'text-primary hover:text-primary/80'
                                                : 'text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100',
                                        )}
                                        title={step.linked_category_id ? 'Change assigned agent' : 'Assign an agent'}
                                    >
                                        <Link2 className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Category picker dropdown */}
                                    {categoryPickerOpen === step.id && (
                                        <>
                                            <div className="fixed inset-0 z-20" onClick={() => setCategoryPickerOpen(null)} />
                                            <div className="absolute right-0 top-full mt-1 w-56 bg-popover border border-border rounded-lg shadow-xl z-30 py-1 max-h-64 overflow-y-auto">
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                    Assign Agent
                                                </div>
                                                {step.linked_category_id && (
                                                    <button
                                                        onClick={() => linkCategory.mutate({ stepId: step.id, categoryId: null })}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                                                    >
                                                        <Unlink className="w-3.5 h-3.5" />
                                                        Remove agent
                                                    </button>
                                                )}
                                                <div className="border-t border-border my-1" />
                                                {categories.length === 0 ? (
                                                    <div className="px-3 py-2 text-xs text-muted-foreground">
                                                        No categories found
                                                    </div>
                                                ) : (
                                                    categories.map((cat: any) => (
                                                        <button
                                                            key={cat.id}
                                                            onClick={() => linkCategory.mutate({ stepId: step.id, categoryId: cat.id })}
                                                            className={cn(
                                                                'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors',
                                                                step.linked_category_id === cat.id && 'bg-primary/10 text-primary',
                                                            )}
                                                        >
                                                            <span
                                                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10"
                                                                style={{ backgroundColor: cat.color || '#71717a' }}
                                                            />
                                                            <span className="truncate">{cat.name}</span>
                                                            {step.linked_category_id === cat.id && (
                                                                <span className="ml-auto text-[9px] text-primary">linked</span>
                                                            )}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Delete */}
                                <button
                                    onClick={() => removeStep.mutate(step.id)}
                                    disabled={steps.length <= 1 || deletingId === step.id}
                                    className="p-1 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0 disabled:opacity-0"
                                >
                                    {deletingId === step.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                </button>
                            </div>

                            {/* Linked category info line */}
                            {step.linked_category && (
                                <div className="ml-10 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                                    <Sparkles className="w-3 h-3" />
                                    Inherits skills & knowledge from
                                    <span className="text-primary/70 font-medium">{step.linked_category.name}</span>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Add step */}
            <div className="flex items-center gap-2">
                <Input
                    value={newStepName}
                    onChange={(e) => setNewStepName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            addStep.mutate()
                        }
                    }}
                    placeholder="Add a step..."
                    className="h-8 text-xs flex-1"
                />
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addStep.mutate()}
                    disabled={!newStepName.trim() || addStep.isPending}
                    className="h-8"
                >
                    {addStep.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <Plus className="w-3.5 h-3.5" />
                    )}
                </Button>
            </div>

            {/* Step Config Drawer */}
            {configStep && (
                <StepConfigDrawer
                    boardId={boardId}
                    step={configStep}
                    allSteps={steps}
                    onClose={() => setConfigStep(null)}
                />
            )}
        </div>
    )
}
