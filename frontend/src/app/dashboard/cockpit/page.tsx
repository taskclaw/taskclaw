'use client'

import { useState, useEffect } from 'react'
import { usePods, useDeletePod } from '@/hooks/use-pods'
import { PodCard } from '@/components/pods/pod-card'
import { CreatePodDialog } from '@/components/pods/create-pod-dialog'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Plus,
    Layers,
    Bot,
    Play,
    Clock,
    ChevronDown,
    ChevronRight,
    Loader2,
    Activity,
    CheckCircle2,
    XCircle,
    AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useBackboneConnections } from '@/hooks/use-backbone-connections'
import {
    getPilotConfig,
    upsertPilotConfig,
    runPilot,
    getExecutionLog,
    type PilotConfig,
} from '@/app/dashboard/pods/actions'
import type { ExecutionLog, Pod } from '@/types/pod'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

export default function CockpitPage() {
    const { data: pods, isLoading } = usePods()
    const deletePod = useDeletePod()
    const [showCreate, setShowCreate] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    const handleDelete = (pod: Pod) => {
        setDeleteTarget({ id: pod.id, name: pod.name })
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const result = await deletePod.mutateAsync(deleteTarget.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                setDeleteTarget(null)
                toast.success('Pod deleted')
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete pod')
        } finally {
            setDeleteLoading(false)
        }
    }

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Page Header */}
            <header className="flex h-16 shrink-0 items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <h1 className="text-lg font-bold">Workspace Cockpit</h1>
                    {pods && pods.length > 0 && (
                        <span className="text-xs text-muted-foreground font-medium bg-accent/50 px-2 py-0.5 rounded">
                            {pods.length}
                        </span>
                    )}
                </div>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    New Pod
                </Button>
            </header>

            <p className="text-sm text-muted-foreground pb-4">
                Monitor and manage all your Pods from one place
            </p>

            {/* Workspace Pilot Card */}
            <WorkspacePilotCard />

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {isLoading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
                        ))}
                    </div>
                ) : !pods || pods.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 rounded-xl bg-accent/50 flex items-center justify-center mb-4">
                            <Layers className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2">No Pods yet</h2>
                        <p className="text-muted-foreground mb-6 max-w-sm">
                            Create your first Pod to organize your boards and AI agents into focused departments
                        </p>
                        <Button onClick={() => setShowCreate(true)}>
                            <Plus className="w-4 h-4 mr-1" />
                            Create your first Pod
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {pods.map((pod) => (
                            <PodCard key={pod.id} pod={pod} onDelete={handleDelete} />
                        ))}
                    </div>
                )}
            </div>

            {/* Pilot Activity feed */}
            <PilotActivityFeed />

            <CreatePodDialog open={showCreate} onOpenChange={setShowCreate} />

            <ConfirmDeleteDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={confirmDelete}
                title="Delete pod?"
                description="This will permanently delete this pod. Boards will become unassigned."
                loading={deleteLoading}
            />
        </div>
    )
}

// ── Workspace Pilot Card ───────────────────────────────────────────────────

function WorkspacePilotCard() {
    const { data: backbones = [] } = useBackboneConnections()
    const [config, setConfig] = useState<PilotConfig | null>(null)
    const [expanded, setExpanded] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [running, setRunning] = useState(false)

    // Form fields
    const [isActive, setIsActive] = useState(false)
    const [backboneId, setBackboneId] = useState<string>('')
    const [systemPrompt, setSystemPrompt] = useState('')
    const [maxTasks, setMaxTasks] = useState(10)
    const [approvalRequired, setApprovalRequired] = useState(true)

    useEffect(() => {
        loadConfig()
    }, [])

    async function loadConfig() {
        setLoading(true)
        try {
            // NOTE: Depends on BE15. Returns null until API is ready.
            const cfg = await getPilotConfig(null) // null = workspace level
            if (cfg) {
                setConfig(cfg)
                setIsActive(cfg.is_active)
                setBackboneId(cfg.backbone_connection_id || '')
                setSystemPrompt(cfg.system_prompt || '')
                setMaxTasks(cfg.max_tasks_per_cycle || 10)
                setApprovalRequired(cfg.approval_required ?? true)
            }
        } catch {
            // API not ready
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        try {
            const result = await upsertPilotConfig({
                pod_id: null,
                is_active: isActive,
                backbone_connection_id: backboneId || null,
                system_prompt: systemPrompt,
                max_tasks_per_cycle: maxTasks,
                approval_required: approvalRequired,
            })
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Workspace Pilot settings saved')
                if (result.config) setConfig(result.config)
            }
        } finally {
            setSaving(false)
        }
    }

    async function handleRun() {
        setRunning(true)
        try {
            const result = await runPilot(null)
            if (result.error) {
                toast.error(`Pilot failed: ${result.error}`)
            } else {
                const actions = result.actions_taken ?? 0
                toast.success(
                    result.summary
                        ? `Workspace Pilot complete: ${result.summary.slice(0, 120)}${result.summary.length > 120 ? '…' : ''}`
                        : `Workspace Pilot complete — ${actions} action${actions !== 1 ? 's' : ''} taken`,
                    { duration: 6000 }
                )
                await loadConfig()
            }
        } finally {
            setRunning(false)
        }
    }

    return (
        <div className="border rounded-xl bg-card mb-4 overflow-hidden">
            {/* Header row */}
            <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">Workspace Pilot</h3>
                        {config?.is_active ? (
                            <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-700 dark:text-green-400">
                                Active
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-xs">
                                Inactive
                            </Badge>
                        )}
                    </div>
                    {loading ? (
                        <p className="text-xs text-muted-foreground mt-0.5 animate-pulse">Loading...</p>
                    ) : config?.last_run_at ? (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            Last run {formatDistanceToNow(new Date(config.last_run_at), { addSuffix: true })}
                            {config.last_run_summary && ` — ${config.last_run_summary}`}
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Coordinates tasks across all pods using AI.
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRun}
                        disabled={running || !config?.is_active}
                        className="h-7 text-xs"
                        title={!config?.is_active ? 'Enable pilot first' : undefined}
                    >
                        {running ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                            <Play className="w-3.5 h-3.5 mr-1" />
                        )}
                        Run Now
                    </Button>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground"
                    >
                        {expanded ? (
                            <ChevronDown className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </div>

            {/* Expanded config form */}
            {expanded && (
                <div className="border-t p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Enable Workspace Pilot</Label>
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">AI Backbone</Label>
                        <Select value={backboneId} onValueChange={setBackboneId}>
                            <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Use account default" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">Use account default</SelectItem>
                                {(backbones as any[]).map((b: any) => (
                                    <SelectItem key={b.id} value={b.id}>
                                        {b.name || b.adapter_slug}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">System Prompt</Label>
                        <Textarea
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            placeholder="You are a workspace coordinator. Review all pods and suggest strategic actions..."
                            className="text-sm min-h-[80px] resize-none"
                        />
                    </div>

                    <Button size="sm" onClick={handleSave} disabled={saving} className="w-full">
                        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                        Save settings
                    </Button>
                </div>
            )}
        </div>
    )
}

// ── Pilot Activity Feed ────────────────────────────────────────────────────

function PilotActivityFeed() {
    const [logs, setLogs] = useState<ExecutionLog[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)

    useEffect(() => {
        loadLogs()
    }, [])

    async function loadLogs() {
        setLoading(true)
        try {
            // NOTE: Depends on BE15. Returns empty until API is ready.
            const data = await getExecutionLog({ trigger_type: 'coordinator' })
            setLogs((data || []).slice(0, 5))
        } catch {
            setLogs([])
        } finally {
            setLoading(false)
        }
    }

    if (!loading && logs.length === 0) return null

    return (
        <div className="mt-4 border rounded-xl bg-card overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2 p-3 text-left hover:bg-accent/30 transition-colors"
            >
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium flex-1">Pilot Activity</span>
                {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                ) : (
                    <span className="text-xs text-muted-foreground">{logs.length} entries</span>
                )}
                {open ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
            </button>

            {open && (
                <div className="border-t divide-y">
                    {logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 p-3">
                            <StatusIcon status={log.status} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <TriggerBadge type={log.trigger_type} />
                                    <StatusBadge status={log.status} />
                                    {log.metadata && (log.metadata as any).actions_taken != null && (
                                        <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded">
                                            {(log.metadata as any).actions_taken} actions
                                        </span>
                                    )}
                                </div>
                                {log.summary && (
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                        {log.summary}
                                    </p>
                                )}
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] text-muted-foreground">
                                        {formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}
                                    </span>
                                    {log.duration_ms != null && (
                                        <span className="text-[10px] text-muted-foreground">
                                            {log.duration_ms < 1000
                                                ? `${log.duration_ms}ms`
                                                : `${(log.duration_ms / 1000).toFixed(1)}s`}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function StatusIcon({ status }: { status: string }) {
    if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
    if (status === 'error') return <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
    return <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
}

function TriggerBadge({ type }: { type: string }) {
    return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {type}
        </Badge>
    )
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        success: 'bg-green-500/15 text-green-700 dark:text-green-400',
        error: 'bg-destructive/15 text-destructive',
        running: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
        skipped: 'bg-muted text-muted-foreground',
        dry_run: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    }
    return (
        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', map[status] || '')}>
            {status}
        </Badge>
    )
}
