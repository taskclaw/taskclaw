'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useUpdateBoard } from '@/hooks/use-boards'
import type { Board } from '@/types/board'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { BoardIcon } from '@/lib/board-icon'
import { BackbonePicker } from '@/components/backbones/backbone-picker'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const PRESET_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#eab308', '#22c55e', '#06b6d4',
]

const PRESET_ICONS = [
    'layout-grid', 'kanban', 'list-checks', 'clipboard-list',
    'briefcase', 'rocket', 'target', 'zap',
    'heart', 'star', 'code', 'book-open',
    'users', 'settings', 'shopping-cart', 'megaphone',
]

interface BoardSettingsFormProps {
    board: Board
}

export function BoardSettingsForm({ board }: BoardSettingsFormProps) {
    const updateBoard = useUpdateBoard()
    const [name, setName] = useState(board.name)
    const [description, setDescription] = useState(board.description || '')
    const [color, setColor] = useState(board.color || PRESET_COLORS[0])
    const [icon, setIcon] = useState(board.icon || 'layout-grid')
    const [tags, setTags] = useState(board.tags?.join(', ') || '')
    const [backboneConnectionId, setBackboneConnectionId] = useState<string | null>(
        board.default_backbone_connection_id ?? null,
    )

    const handleSave = async () => {
        if (!name.trim()) return

        try {
            const result = await updateBoard.mutateAsync({
                id: board.id,
                name: name.trim(),
                description: description.trim() || undefined,
                color,
                icon: icon || undefined,
                tags: tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                default_backbone_connection_id: backboneConnectionId,
            } as any)

            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Board updated')
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to update board')
        }
    }

    return (
        <div className="space-y-5">
            {/* Name */}
            <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Board Name
                </Label>
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>

            {/* Description */}
            <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Description
                </Label>
                <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description..."
                    rows={2}
                    className="resize-none"
                />
            </div>

            {/* Color */}
            <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Color
                </Label>
                <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            className="w-6 h-6 rounded-full border-2 transition-all"
                            style={{
                                backgroundColor: c,
                                borderColor: color === c ? 'white' : 'transparent',
                                transform: color === c ? 'scale(1.2)' : 'scale(1)',
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* Icon */}
            <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Icon
                </Label>
                <div className="flex flex-wrap gap-2">
                    {PRESET_ICONS.map((ic) => (
                        <button
                            key={ic}
                            type="button"
                            onClick={() => setIcon(ic)}
                            className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center border transition-all',
                                icon === ic
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                            )}
                        >
                            <BoardIcon name={ic} className="w-4 h-4" />
                        </button>
                    ))}
                </div>
            </div>

            {/* AI Backbone */}
            <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    AI Backbone
                </Label>
                <p className="text-[10px] text-muted-foreground mb-2">
                    AI provider used by this board. Steps inherit this unless overridden.
                </p>
                <BackbonePicker
                    value={backboneConnectionId}
                    onChange={setBackboneConnectionId}
                    showInheritOption
                    inheritLabel="Inherit from account default"
                />
            </div>

            {/* Tags */}
            <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Tags (comma-separated)
                </Label>
                <Input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="e.g. sprint, marketing, dev"
                />
            </div>

            {/* Save */}
            <Button
                onClick={handleSave}
                disabled={!name.trim() || updateBoard.isPending}
            >
                {updateBoard.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
            </Button>
        </div>
    )
}
