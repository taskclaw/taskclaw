'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { createTask } from '@/app/dashboard/tasks/actions'
import type { Category } from '@/types/task'
import type { BoardStep } from '@/types/board'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface NewBoardTaskDialogProps {
    boardId: string
    step: BoardStep
    categories: Category[]
    onClose: () => void
}

export function NewBoardTaskDialog({
    boardId,
    step,
    categories,
    onClose,
}: NewBoardTaskDialogProps) {
    const [title, setTitle] = useState('')
    const [categoryId, setCategoryId] = useState(categories[0]?.id || '')
    const [priority, setPriority] = useState('Medium')
    const [loading, setLoading] = useState(false)
    const qc = useQueryClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) return

        setLoading(true)
        try {
            const result = await createTask({
                title: title.trim(),
                category_id: categoryId || undefined,
                priority,
                status: step.name,
                board_instance_id: boardId,
                current_step_id: step.id,
            } as any)

            if (result.error) {
                toast.error(result.error)
            } else {
                qc.invalidateQueries({ queryKey: ['boardTasks', boardId] })
                onClose()
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to create task')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl p-6 w-[400px] shadow-2xl">
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

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Input
                            autoFocus
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Task name..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                                Category
                            </Label>
                            <select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2 text-xs outline-none"
                            >
                                <option value="">No category</option>
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

                    <Button
                        type="submit"
                        disabled={!title.trim() || loading}
                        className="w-full"
                    >
                        {loading ? 'Creating...' : 'Create Task'}
                    </Button>
                </form>
            </div>
        </div>
    )
}
