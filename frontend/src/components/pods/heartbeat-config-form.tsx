'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    getHeartbeatConfigs,
    createHeartbeatConfig,
    toggleHeartbeat,
    triggerHeartbeat,
} from '@/app/dashboard/pods/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Plus, Play, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { HeartbeatConfig } from '@/types/pod'

interface Props {
    podId: string
}

export function HeartbeatConfigForm({ podId }: Props) {
    const qc = useQueryClient()
    const { data: configs, isLoading } = useQuery({
        queryKey: ['heartbeat-configs', podId],
        queryFn: () => getHeartbeatConfigs(podId),
    })

    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [triggeringId, setTriggeringId] = useState<string | null>(null)

    // Form state
    const [name, setName] = useState('')
    const [schedule, setSchedule] = useState('0 */6 * * *')
    const [prompt, setPrompt] = useState('')
    const [maxTasksPerRun, setMaxTasksPerRun] = useState(5)
    const [dryRun, setDryRun] = useState(true)

    const handleCreate = async () => {
        if (!name.trim() || !prompt.trim()) {
            toast.error('Name and prompt are required')
            return
        }

        setSaving(true)
        try {
            const result = await createHeartbeatConfig({
                pod_id: podId,
                name: name.trim(),
                schedule,
                prompt: prompt.trim(),
                max_tasks_per_run: maxTasksPerRun,
                dry_run: dryRun,
                is_active: false,
            })

            if (result.success) {
                toast.success('Heartbeat config created')
                setShowForm(false)
                setName('')
                setSchedule('0 */6 * * *')
                setPrompt('')
                setMaxTasksPerRun(5)
                setDryRun(true)
                qc.invalidateQueries({ queryKey: ['heartbeat-configs', podId] })
            } else {
                toast.error(result.error || 'Failed to create config')
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to create config')
        } finally {
            setSaving(false)
        }
    }

    const handleToggle = async (config: HeartbeatConfig, newActive: boolean) => {
        const result = await toggleHeartbeat(config.id, newActive)
        if (result.success) {
            qc.invalidateQueries({ queryKey: ['heartbeat-configs', podId] })
        } else {
            toast.error(result.error || 'Failed to toggle heartbeat')
        }
    }

    const handleTrigger = async (configId: string) => {
        setTriggeringId(configId)
        try {
            const result = await triggerHeartbeat(configId)
            if (result.success) {
                toast.success('Heartbeat triggered')
                qc.invalidateQueries({ queryKey: ['execution-log', podId] })
            } else {
                toast.error(result.error || 'Failed to trigger heartbeat')
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to trigger')
        } finally {
            setTriggeringId(null)
        }
    }

    if (isLoading) return <div className="animate-pulse h-32 rounded bg-muted" />

    return (
        <div className="space-y-4">
            {/* Existing configs */}
            {configs && configs.length > 0 ? (
                <div className="space-y-3">
                    {configs.map((config) => (
                        <div key={config.id} className="border rounded-lg p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-medium">{config.name}</h4>
                                    <p className="text-xs text-muted-foreground font-mono">{config.schedule}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleTrigger(config.id)}
                                        disabled={triggeringId === config.id}
                                    >
                                        {triggeringId === config.id ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Play className="w-3 h-3" />
                                        )}
                                        <span className="ml-1">Run Now</span>
                                    </Button>
                                    <Switch
                                        checked={config.is_active}
                                        onCheckedChange={(checked) => handleToggle(config, checked)}
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{config.prompt}</p>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                <span>Max tasks: {config.max_tasks_per_run}</span>
                                {config.dry_run && <span className="text-purple-500 font-medium">DRY RUN</span>}
                                {config.last_run_status && (
                                    <span className={
                                        config.last_run_status === 'success' ? 'text-green-600' :
                                        config.last_run_status === 'error' ? 'text-red-600' :
                                        'text-muted-foreground'
                                    }>
                                        Last: {config.last_run_status}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                    No heartbeat configs yet
                </div>
            )}

            {/* Add form */}
            {showForm ? (
                <div className="border rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold">New Heartbeat Config</h4>

                    <div className="space-y-2">
                        <Label htmlFor="hb-name">Name</Label>
                        <Input
                            id="hb-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Daily task review"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="hb-schedule">Schedule (cron)</Label>
                        <Input
                            id="hb-schedule"
                            value={schedule}
                            onChange={(e) => setSchedule(e.target.value)}
                            placeholder="0 */6 * * *"
                            className="font-mono"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="hb-prompt">Prompt</Label>
                        <Textarea
                            id="hb-prompt"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Describe what the heartbeat should do..."
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="hb-max">Max tasks per run</Label>
                        <Input
                            id="hb-max"
                            type="number"
                            value={maxTasksPerRun}
                            onChange={(e) => setMaxTasksPerRun(parseInt(e.target.value) || 1)}
                            min={1}
                            max={50}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <Label htmlFor="hb-dry">Dry Run</Label>
                        <Switch
                            id="hb-dry"
                            checked={dryRun}
                            onCheckedChange={setDryRun}
                        />
                    </div>

                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={saving}>
                            {saving ? 'Creating...' : 'Save'}
                        </Button>
                    </div>
                </div>
            ) : (
                <Button variant="outline" onClick={() => setShowForm(true)} className="w-full">
                    <Plus className="w-4 h-4 mr-1" />
                    Add Heartbeat
                </Button>
            )}
        </div>
    )
}
