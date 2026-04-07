'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreatePod } from '@/hooks/use-pods'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const PRESET_COLORS = [
    '#6366f1',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#06b6d4',
    '#ec4899',
    '#84cc16',
]

interface CreatePodDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function CreatePodDialog({ open, onOpenChange }: CreatePodDialogProps) {
    const router = useRouter()
    const createPod = useCreatePod()

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [icon, setIcon] = useState('')
    const [color, setColor] = useState(PRESET_COLORS[0])
    const [backboneConnectionId, setBackboneConnectionId] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        const result = await createPod.mutateAsync({
            name: name.trim(),
            description: description.trim() || undefined,
            icon: icon.trim() || undefined,
            color,
            backbone_connection_id: backboneConnectionId.trim() || undefined,
        })

        if (result.success && result.pod) {
            toast.success('Pod created')
            onOpenChange(false)
            setName('')
            setDescription('')
            setIcon('')
            setColor(PRESET_COLORS[0])
            setBackboneConnectionId('')
            router.push(`/dashboard/pods/${result.pod.slug}`)
        } else if (result.error) {
            toast.error(result.error)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create New Pod</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="pod-name">Name</Label>
                        <Input
                            id="pod-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Marketing, Engineering"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="pod-description">Description</Label>
                        <Textarea
                            id="pod-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What does this pod do?"
                            rows={2}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="pod-icon">Icon (emoji)</Label>
                        <Input
                            id="pod-icon"
                            value={icon}
                            onChange={(e) => setIcon(e.target.value)}
                            placeholder="e.g. \uD83D\uDE80"
                            maxLength={4}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Color</Label>
                        <div className="flex gap-2">
                            {PRESET_COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={cn(
                                        'w-7 h-7 rounded-full transition-all',
                                        color === c
                                            ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110'
                                            : 'hover:scale-110',
                                    )}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="pod-backbone">Backbone Connection ID</Label>
                        <Input
                            id="pod-backbone"
                            value={backboneConnectionId}
                            onChange={(e) => setBackboneConnectionId(e.target.value)}
                            placeholder="Optional — override workspace backbone"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!name.trim() || createPod.isPending}>
                            {createPod.isPending ? 'Creating...' : 'Create Pod'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
