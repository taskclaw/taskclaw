'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useCreateTask } from '@/hooks/use-tasks'
import type { TaskStatus, Category } from '@/types/task'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface NewTaskDialogProps {
    defaultStatus?: TaskStatus
    defaultCategoryId?: string
    categories: Category[]
    onClose: () => void
}

export function NewTaskDialog({
    defaultStatus,
    defaultCategoryId,
    categories,
    onClose,
}: NewTaskDialogProps) {
    const [title, setTitle] = useState('')
    const [categoryId, setCategoryId] = useState(defaultCategoryId || categories[0]?.id || '')
    const [priority, setPriority] = useState('Medium')
    const createTask = useCreateTask()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) return

        await createTask.mutateAsync({
            title: title.trim(),
            category_id: categoryId || undefined,
            priority,
            status: defaultStatus || 'To-Do',
        })
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl p-6 w-[400px] shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-bold">New Task</h2>
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
                                Agent
                            </Label>
                            <select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2 text-xs outline-none"
                            >
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
                        disabled={!title.trim() || createTask.isPending}
                        className="w-full"
                    >
                        {createTask.isPending ? 'Creating...' : 'Create Task'}
                    </Button>
                </form>
            </div>
        </div>
    )
}
