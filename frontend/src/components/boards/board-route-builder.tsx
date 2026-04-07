'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { createBoardRoute } from '@/app/dashboard/pods/actions'
import { toast } from 'sonner'

interface BoardRouteBuilderProps {
    boards: { id: string; name: string }[]
    sourceBoardId: string
    sourceBoardName: string
}

export function BoardRouteBuilder({ boards, sourceBoardId, sourceBoardName }: BoardRouteBuilderProps) {
    const [targetBoardId, setTargetBoardId] = useState('')
    const [trigger, setTrigger] = useState<'auto' | 'ai_decision' | 'manual'>('auto')
    const [isActive, setIsActive] = useState(true)
    const [saving, setSaving] = useState(false)

    const availableBoards = boards.filter((b) => b.id !== sourceBoardId)

    const handleSave = async () => {
        if (!targetBoardId) {
            toast.error('Please select a target board')
            return
        }

        setSaving(true)
        try {
            const result = await createBoardRoute({
                source_board_id: sourceBoardId,
                target_board_id: targetBoardId,
                trigger,
                is_active: isActive,
                transform_config: {},
            })

            if (result.success) {
                toast.success('Route created')
                setTargetBoardId('')
                setTrigger('auto')
                setIsActive(true)
            } else {
                toast.error(result.error || 'Failed to create route')
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to create route')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold">Create Board Route</h3>

            <div className="space-y-2">
                <Label>Source Board</Label>
                <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {sourceBoardName}
                </div>
            </div>

            <div className="space-y-2">
                <Label>Target Board</Label>
                <Select value={targetBoardId} onValueChange={setTargetBoardId}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select target board" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableBoards.map((board) => (
                            <SelectItem key={board.id} value={board.id}>
                                {board.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Trigger Type</Label>
                <Select value={trigger} onValueChange={(v) => setTrigger(v as typeof trigger)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="ai_decision">AI Decision</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex items-center justify-between">
                <Label htmlFor="route-active">Active</Label>
                <Switch
                    id="route-active"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                />
            </div>

            <Button onClick={handleSave} disabled={saving || !targetBoardId} className="w-full">
                {saving ? 'Creating...' : 'Create Route'}
            </Button>
        </div>
    )
}
