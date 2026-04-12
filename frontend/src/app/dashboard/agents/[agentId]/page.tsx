'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Bot, ChevronLeft, Copy, Pause, Play, Trash2, Loader2,
    CheckCircle, XCircle, Zap, Clock, Activity, Settings2,
    RefreshCw
} from 'lucide-react'
import { useAgent, useAgentActivity, useUpdateAgent, usePauseAgent, useResumeAgent, useCloneAgent, useDeleteAgent } from '@/hooks/use-agents'
import { useQueryClient } from '@tanstack/react-query'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AgentStatusBadge } from '@/components/agents/AgentStatusBadge'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { cn } from '@/lib/utils'
import type { AgentActivity, UpdateAgentInput } from '@/types/agent'

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
    task_completed: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
    task_failed: <XCircle className="w-3.5 h-3.5 text-red-400" />,
    task_assigned: <Activity className="w-3.5 h-3.5 text-blue-400" />,
    conversation_reply: <Bot className="w-3.5 h-3.5 text-indigo-400" />,
    dag_created: <Zap className="w-3.5 h-3.5 text-amber-400" />,
    route_triggered: <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />,
    status_changed: <Settings2 className="w-3.5 h-3.5 text-zinc-400" />,
    error: <XCircle className="w-3.5 h-3.5 text-red-500" />,
}

function ActivityItem({ item }: { item: AgentActivity }) {
    const icon = ACTIVITY_ICONS[item.activity_type] ?? <Activity className="w-3.5 h-3.5 text-zinc-400" />
    const date = new Date(item.created_at)
    const timeAgo = formatTimeAgo(date)

    return (
        <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
            <div className="mt-0.5 shrink-0">{icon}</div>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{item.summary}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{timeAgo}</p>
            </div>
        </div>
    )
}

function formatTimeAgo(date: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'just now'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDays = Math.floor(diffHr / 24)
    return `${diffDays}d ago`
}

const COLOR_PRESETS = [
    '#7C3AED', '#6366F1', '#0EA5E9', '#10B981', '#F59E0B',
    '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
]

export default function AgentDetailPage() {
    const { agentId } = useParams<{ agentId: string }>()
    const router = useRouter()
    const qc = useQueryClient()
    const [tab, setTab] = useState<'overview' | 'settings'>('overview')
    const [activityPage, setActivityPage] = useState(1)
    const [deleteConfirm, setDeleteConfirm] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const { data: agent, isLoading } = useAgent(agentId)
    const { data: activityData, isLoading: activityLoading } = useAgentActivity(agentId, activityPage)
    const updateMutation = useUpdateAgent()
    const pauseMutation = usePauseAgent()
    const resumeMutation = useResumeAgent()
    const cloneMutation = useCloneAgent()
    const deleteMutation = useDeleteAgent()

    // Edit form state
    const [form, setForm] = useState<UpdateAgentInput | null>(null)
    const editForm = form ?? (agent ? {
        name: agent.name,
        description: agent.description ?? '',
        persona: agent.persona ?? '',
        color: agent.color ?? '#7C3AED',
        max_concurrent_tasks: agent.max_concurrent_tasks,
        model_override: agent.model_override ?? '',
    } : null)

    const isDirty = agent && editForm && (
        editForm.name !== agent.name ||
        (editForm.description ?? '') !== (agent.description ?? '') ||
        (editForm.persona ?? '') !== (agent.persona ?? '') ||
        (editForm.color ?? '') !== (agent.color ?? '') ||
        editForm.max_concurrent_tasks !== agent.max_concurrent_tasks ||
        (editForm.model_override ?? '') !== (agent.model_override ?? '')
    )

    const handleSave = async () => {
        if (!editForm || !isDirty) return
        setSaveError(null)
        try {
            await updateMutation.mutateAsync({ agentId, input: editForm })
            setForm(null)
        } catch (e: any) {
            setSaveError(e?.message ?? 'Failed to save')
        }
    }

    const handleDelete = async () => {
        if (!deleteConfirm) {
            setDeleteConfirm(true)
            return
        }
        await deleteMutation.mutateAsync(agentId)
        router.push('/dashboard/agents')
    }

    const handleClone = async () => {
        await cloneMutation.mutateAsync({ agentId })
        qc.invalidateQueries({ queryKey: ['agents'] })
        router.push('/dashboard/agents')
    }

    if (isLoading) {
        return (
            <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                    Loading agent...
                </div>
            </div>
        )
    }

    if (!agent) {
        return (
            <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                    Agent not found.
                </div>
            </div>
        )
    }

    const successRate =
        agent.total_tasks_completed + agent.total_tasks_failed > 0
            ? Math.round(
                  (agent.total_tasks_completed /
                      (agent.total_tasks_completed + agent.total_tasks_failed)) *
                      100,
              )
            : null

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <header className="flex h-16 shrink-0 items-center gap-2 px-4 border-b border-border">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 !h-4" />
                <button
                    onClick={() => router.push('/dashboard/agents')}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Agents
                </button>
                <Separator orientation="vertical" className="!h-4" />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <AgentAvatar name={agent.name} color={agent.color} avatarUrl={agent.avatar_url} size="sm" />
                    <span className="text-sm font-semibold truncate">{agent.name}</span>
                    <AgentStatusBadge status={agent.status} />
                </div>

                <div className="flex items-center gap-2">
                    {agent.status === 'paused' ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resumeMutation.mutate(agent.id)}
                            disabled={resumeMutation.isPending}
                        >
                            <Play className="w-3.5 h-3.5 mr-1" />
                            Resume
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => pauseMutation.mutate(agent.id)}
                            disabled={pauseMutation.isPending}
                        >
                            <Pause className="w-3.5 h-3.5 mr-1" />
                            Pause
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClone}
                        disabled={cloneMutation.isPending}
                    >
                        <Copy className="w-3.5 h-3.5 mr-1" />
                        Clone
                    </Button>
                </div>
            </header>

            {/* Tabs */}
            <div className="flex gap-4 px-6 border-b border-border">
                {(['overview', 'settings'] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            'py-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px',
                            tab === t
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                {tab === 'overview' && (
                    <div className="max-w-3xl space-y-6">
                        {/* Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard label="Completed" value={agent.total_tasks_completed} icon={<CheckCircle className="w-4 h-4 text-green-400" />} />
                            <StatCard label="Failed" value={agent.total_tasks_failed} icon={<XCircle className="w-4 h-4 text-red-400" />} />
                            <StatCard
                                label="Success Rate"
                                value={successRate !== null ? `${successRate}%` : '—'}
                                icon={<Zap className="w-4 h-4 text-amber-400" />}
                            />
                            <StatCard
                                label="Tokens Used"
                                value={agent.total_tokens_used > 0 ? `${(agent.total_tokens_used / 1000).toFixed(1)}k` : '0'}
                                icon={<Clock className="w-4 h-4 text-blue-400" />}
                            />
                        </div>

                        {/* Agent info */}
                        <div className="rounded-xl border border-border p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <AgentAvatar name={agent.name} color={agent.color} avatarUrl={agent.avatar_url} size="lg" />
                                <div>
                                    <h2 className="text-base font-semibold">{agent.name}</h2>
                                    {agent.description && (
                                        <p className="text-sm text-muted-foreground">{agent.description}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1">
                                        <span
                                            className="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
                                            style={{
                                                backgroundColor: `${agent.color ?? '#6366f1'}20`,
                                                color: agent.color ?? '#6366f1',
                                            }}
                                        >
                                            {agent.agent_type}
                                        </span>
                                        {agent.last_active_at && (
                                            <span className="text-xs text-muted-foreground">
                                                Last active {formatTimeAgo(new Date(agent.last_active_at))}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {agent.persona && (
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Persona</p>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{agent.persona}</p>
                                </div>
                            )}
                        </div>

                        {/* Activity feed */}
                        <div>
                            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                <Activity className="w-4 h-4" />
                                Activity
                            </h3>
                            {activityLoading ? (
                                <div className="text-sm text-muted-foreground">Loading activity...</div>
                            ) : !activityData?.data.length ? (
                                <div className="text-sm text-muted-foreground">No activity yet.</div>
                            ) : (
                                <>
                                    <div className="rounded-xl border border-border divide-y divide-border px-4">
                                        {activityData.data.map((item) => (
                                            <ActivityItem key={item.id} item={item} />
                                        ))}
                                    </div>
                                    {activityData.pagination.totalPages > 1 && (
                                        <div className="flex items-center gap-2 mt-3 text-sm">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setActivityPage((p) => Math.max(p - 1, 1))}
                                                disabled={activityPage === 1}
                                            >
                                                Previous
                                            </Button>
                                            <span className="text-muted-foreground">
                                                {activityPage} / {activityData.pagination.totalPages}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setActivityPage((p) => Math.min(p + 1, activityData.pagination.totalPages))}
                                                disabled={activityPage === activityData.pagination.totalPages}
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'settings' && editForm && (
                    <div className="max-w-2xl space-y-6">
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    value={editForm.name ?? ''}
                                    onChange={(e) => setForm((f) => ({ ...(f ?? editForm), name: e.target.value }))}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label htmlFor="description">Description</Label>
                                <Input
                                    id="description"
                                    value={editForm.description ?? ''}
                                    onChange={(e) => setForm((f) => ({ ...(f ?? editForm), description: e.target.value }))}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label>Color</Label>
                                <div className="flex gap-2 mt-1 flex-wrap">
                                    {COLOR_PRESETS.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setForm((f) => ({ ...(f ?? editForm), color: c }))}
                                            className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${editForm.color === c ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="persona">Persona (System Prompt)</Label>
                                <Textarea
                                    id="persona"
                                    value={editForm.persona ?? ''}
                                    onChange={(e) => setForm((f) => ({ ...(f ?? editForm), persona: e.target.value }))}
                                    rows={6}
                                    className="mt-1 resize-none"
                                />
                            </div>
                            <div>
                                <Label htmlFor="model">Model Override</Label>
                                <Input
                                    id="model"
                                    placeholder="e.g. claude-sonnet-4-6"
                                    value={editForm.model_override ?? ''}
                                    onChange={(e) => setForm((f) => ({ ...(f ?? editForm), model_override: e.target.value }))}
                                    className="mt-1"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Leave blank to use account default.</p>
                            </div>
                            <div>
                                <Label htmlFor="max-tasks">Max Concurrent Tasks</Label>
                                <Input
                                    id="max-tasks"
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={editForm.max_concurrent_tasks ?? 3}
                                    onChange={(e) => setForm((f) => ({ ...(f ?? editForm), max_concurrent_tasks: parseInt(e.target.value) || 3 }))}
                                    className="mt-1 w-24"
                                />
                            </div>
                        </div>

                        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

                        <div className="flex items-center justify-between pt-2">
                            <Button
                                onClick={handleSave}
                                disabled={!isDirty || updateMutation.isPending}
                            >
                                {updateMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Saving...
                                    </>
                                ) : 'Save Changes'}
                            </Button>

                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleDelete}
                                disabled={deleteMutation.isPending}
                            >
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                {deleteConfirm ? 'Confirm Delete' : 'Deactivate Agent'}
                            </Button>
                        </div>

                        {deleteConfirm && (
                            <p className="text-xs text-destructive">
                                Click again to confirm. This will deactivate the agent and remove it from all active assignments.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-border p-4 bg-card">
            <div className="flex items-center gap-2 mb-1">
                {icon}
                <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-xl font-bold">{value}</p>
        </div>
    )
}
