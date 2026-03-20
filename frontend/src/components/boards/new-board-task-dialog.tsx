'use client'

import { useState } from 'react'
import { X, Play, Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { createTask } from '@/app/dashboard/tasks/actions'
import { getOrCreateConversation, sendMessageBackground } from '@/app/dashboard/chat/actions'
import type { Category } from '@/types/task'
import type { BoardStep, SchemaField } from '@/types/board'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { SchemaFieldRenderer } from './schema-field-renderer'
import { useTaskStore } from '@/hooks/use-task-store'

interface NewBoardTaskDialogProps {
    boardId: string
    step: BoardStep
    categories: Category[]
    onClose: () => void
}

function buildDefaults(fields: SchemaField[]): Record<string, any> {
    const defaults: Record<string, any> = {}
    for (const field of fields) {
        if (field.default_value !== undefined && field.default_value !== '') {
            defaults[field.key] = field.type === 'number'
                ? Number(field.default_value)
                : field.type === 'boolean'
                    ? field.default_value === 'true'
                    : field.default_value
        }
    }
    return defaults
}

export function NewBoardTaskDialog({
    boardId,
    step,
    categories,
    onClose,
}: NewBoardTaskDialogProps) {
    const [title, setTitle] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [priority, setPriority] = useState('Medium')
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState<'create' | 'ai' | null>(null)
    const [cardData, setCardData] = useState<Record<string, any>>(() =>
        buildDefaults(step.input_schema || [])
    )
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const qc = useQueryClient()
    const setSelectedTaskId = useTaskStore((s) => s.setSelectedTaskId)

    const hasStepFields = (step.input_schema?.length ?? 0) > 0
    const canAiExecute = step.ai_first || !!step.linked_category_id

    const validate = (): boolean => {
        if (!title.trim()) return false

        if (hasStepFields) {
            const errors: Record<string, string> = {}
            for (const field of step.input_schema) {
                if (field.required && (cardData[field.key] === undefined || cardData[field.key] === '')) {
                    errors[field.key] = `${field.label} is required`
                }
            }
            if (Object.keys(errors).length > 0) {
                setFieldErrors(errors)
                return false
            }
        }
        return true
    }

    const doCreate = async () => {
        const hasData = Object.keys(cardData).some(
            (k) => cardData[k] !== undefined && cardData[k] !== '',
        )

        const result = await createTask({
            title: title.trim(),
            category_id: categoryId || undefined,
            priority,
            notes: notes.trim() || undefined,
            status: step.name,
            board_instance_id: boardId,
            current_step_id: step.id,
            card_data: hasData ? { [step.step_key]: cardData } : undefined,
        })

        if (result.error) {
            toast.error(result.error)
            return null
        }

        qc.invalidateQueries({ queryKey: ['boardTasks', boardId] })
        return result.task
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!validate()) return

        setLoading('create')
        try {
            const task = await doCreate()
            if (task) onClose()
        } catch (error: any) {
            toast.error(error.message || 'Failed to create task')
        } finally {
            setLoading(null)
        }
    }

    const handleCreateAndExecute = async () => {
        if (!validate()) return

        setLoading('ai')
        try {
            const task = await doCreate()
            if (!task) return

            // Open the task detail panel so user sees AI working
            setSelectedTaskId(task.id)

            // Fire AI in background: create conversation + send initial message
            try {
                const conv = await getOrCreateConversation(task.id, task.title)
                if (conv && !conv.error && conv.id) {
                    let message = `Please analyze and work on this task based on the title and context provided.`
                    if (notes.trim()) {
                        message = `Please analyze and work on this task:\n\nTitle: ${task.title}\nDescription: ${notes.trim()}`
                    }
                    await sendMessageBackground(conv.id, message)
                }
            } catch {
                // AI execution is best-effort — task was already created
            }

            onClose()
        } catch (error: any) {
            toast.error(error.message || 'Failed to create task')
        } finally {
            setLoading(null)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className={`bg-card border border-border rounded-2xl p-6 shadow-2xl ${hasStepFields ? 'w-[480px]' : 'w-[400px]'}`}>
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="text-sm font-bold">New Task</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Adding to <span className="font-medium text-foreground">{step.name}</span>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <Input
                            autoFocus
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Task name..."
                        />
                    </div>

                    {/* Step-specific fields */}
                    {hasStepFields && (
                        <div className="space-y-3 pt-2 border-t border-border">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                {step.name} Fields
                            </p>
                            {step.input_schema.map((field) => (
                                <SchemaFieldRenderer
                                    key={field.key}
                                    field={field}
                                    value={cardData[field.key]}
                                    onChange={(val) => {
                                        setCardData((prev) => ({ ...prev, [field.key]: val }))
                                        if (fieldErrors[field.key]) {
                                            setFieldErrors((prev) => {
                                                const next = { ...prev }
                                                delete next[field.key]
                                                return next
                                            })
                                        }
                                    }}
                                    error={fieldErrors[field.key]}
                                />
                            ))}
                        </div>
                    )}

                    {/* Description */}
                    <div>
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Description
                        </Label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Add context, instructions, or details..."
                            rows={3}
                            className="w-full bg-transparent border border-input rounded-md px-3 py-2 text-xs outline-none resize-y focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                                Agent
                            </Label>
                            <select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2 text-xs outline-none"
                            >
                                <option value="">Use Column&apos;s agent</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                                Priority
                            </Label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value)}
                                className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2 text-xs outline-none"
                            >
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>
                    </div>

                    {/* Dual CTA buttons */}
                    <div className={`grid gap-2 ${canAiExecute ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <Button
                            type="submit"
                            variant="outline"
                            disabled={!title.trim() || loading !== null}
                            className="w-full"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            {loading === 'create' ? 'Creating...' : 'Create Task'}
                        </Button>

                        {canAiExecute && (
                            <Button
                                type="button"
                                onClick={handleCreateAndExecute}
                                disabled={!title.trim() || loading !== null}
                                className="w-full"
                            >
                                <Play className="w-3.5 h-3.5" />
                                {loading === 'ai' ? 'Starting...' : 'Create & AI Execute'}
                            </Button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    )
}
