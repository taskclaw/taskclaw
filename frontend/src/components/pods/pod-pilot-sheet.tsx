'use client'

import { useState, useEffect } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Play, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { useBackboneConnections } from '@/hooks/use-backbone-connections'
import { getPilotConfig, upsertPilotConfig, runPilot, type PilotConfig } from '@/app/dashboard/pods/actions'
import { formatDistanceToNow } from 'date-fns'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

interface PodPilotSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    podId: string
    podName: string
}

export function PodPilotSheet({ open, onOpenChange, podId, podName }: PodPilotSheetProps) {
    const { data: backbones = [] } = useBackboneConnections()
    const [config, setConfig] = useState<PilotConfig | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [running, setRunning] = useState(false)

    // Form state
    const [isActive, setIsActive] = useState(false)
    const [backboneId, setBackboneId] = useState<string>('')
    const [systemPrompt, setSystemPrompt] = useState('')
    const [maxTasks, setMaxTasks] = useState(10)
    const [approvalRequired, setApprovalRequired] = useState(true)

    useEffect(() => {
        if (open && podId) {
            loadConfig()
        }
    }, [open, podId])

    async function loadConfig() {
        setLoading(true)
        try {
            // NOTE: Depends on BE15 (PilotModule). Shows empty form until API is ready.
            const cfg = await getPilotConfig(podId)
            if (cfg) {
                setConfig(cfg)
                setIsActive(cfg.is_active)
                setBackboneId(cfg.backbone_connection_id || '')
                setSystemPrompt(cfg.system_prompt || '')
                setMaxTasks(cfg.max_tasks_per_cycle || 10)
                setApprovalRequired(cfg.approval_required ?? true)
            }
        } catch {
            // API not ready — use defaults
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        try {
            const result = await upsertPilotConfig({
                pod_id: podId,
                is_active: isActive,
                backbone_connection_id: backboneId || null,
                system_prompt: systemPrompt,
                max_tasks_per_cycle: maxTasks,
                approval_required: approvalRequired,
            })
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Pilot settings saved')
                if (result.config) setConfig(result.config)
            }
        } finally {
            setSaving(false)
        }
    }

    async function handleRunPilot() {
        setRunning(true)
        try {
            const result = await runPilot(podId)
            if (result.error) {
                toast.error(`Pilot failed: ${result.error}`)
            } else {
                const actions = result.actions_taken ?? 0
                toast.success(
                    result.summary
                        ? `Pilot complete: ${result.summary.slice(0, 100)}${result.summary.length > 100 ? '…' : ''}`
                        : `Pilot complete — ${actions} action${actions !== 1 ? 's' : ''} taken`,
                    { duration: 6000 }
                )
                await loadConfig()
            }
        } finally {
            setRunning(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Pod Settings — {podName}</SheetTitle>
                    <SheetDescription>
                        Configure the Pilot Agent to autonomously manage this pod's tasks.
                    </SheetDescription>
                </SheetHeader>

                {loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 px-1">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading pilot settings...
                    </div>
                ) : (
                    <div className="mt-6 space-y-6 px-1">
                        {/* Pilot Agent section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold">Pilot Agent</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Automatically manages tasks in this pod using AI.
                                    </p>
                                </div>
                                <Switch
                                    checked={isActive}
                                    onCheckedChange={setIsActive}
                                    aria-label="Enable pilot"
                                />
                            </div>

                            {/* Backbone selector */}
                            <div className="space-y-1.5">
                                <Label className="text-xs">AI Backbone</Label>
                                <Select value={backboneId || '__default__'} onValueChange={(v) => setBackboneId(v === '__default__' ? '' : v)}>
                                    <SelectTrigger className="h-8 text-sm">
                                        <SelectValue placeholder="Use account default" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__default__">Use account default</SelectItem>
                                        {(backbones as any[]).map((b: any) => (
                                            <SelectItem key={b.id} value={b.id}>
                                                {b.name || b.adapter_slug}
                                                {b.is_account_default && (
                                                    <span className="ml-1 text-[10px] text-muted-foreground">(default)</span>
                                                )}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* System prompt */}
                            <div className="space-y-1.5">
                                <Label className="text-xs">System Prompt</Label>
                                <Textarea
                                    value={systemPrompt}
                                    onChange={(e) => setSystemPrompt(e.target.value)}
                                    placeholder="You are a pod coordinator. Review tasks and suggest actions..."
                                    className="text-sm min-h-[100px] resize-none"
                                />
                            </div>

                            {/* Max tasks */}
                            <div className="space-y-1.5">
                                <Label htmlFor="max-tasks" className="text-xs">
                                    Max tasks per cycle
                                </Label>
                                <Input
                                    id="max-tasks"
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={maxTasks}
                                    onChange={(e) => setMaxTasks(Number(e.target.value))}
                                    className="h-8 text-sm w-24"
                                />
                                <p className="text-[10px] text-muted-foreground">Between 1 and 50</p>
                            </div>

                            {/* Approval required */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium">Require approval for DAGs</p>
                                    <p className="text-[10px] text-muted-foreground">
                                        AI-generated task plans need human approval before execution.
                                    </p>
                                </div>
                                <Switch
                                    checked={approvalRequired}
                                    onCheckedChange={setApprovalRequired}
                                    aria-label="Require approval"
                                />
                            </div>
                        </div>

                        {/* Last run info */}
                        {config?.last_run_at && (
                            <div className="border rounded-lg p-3 bg-accent/30 space-y-1">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Clock className="w-3.5 h-3.5" />
                                    Last run{' '}
                                    {formatDistanceToNow(new Date(config.last_run_at), { addSuffix: true })}
                                </div>
                                {config.last_run_summary && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {config.last_run_summary}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2 pt-2">
                            <Button
                                size="sm"
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1"
                            >
                                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                                Save settings
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleRunPilot}
                                disabled={running || !isActive}
                                title={!isActive ? 'Enable pilot first' : undefined}
                            >
                                {running ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                ) : (
                                    <Play className="w-3.5 h-3.5 mr-1.5" />
                                )}
                                Run Pilot
                            </Button>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
