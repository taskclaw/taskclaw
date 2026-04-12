'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Bot, Plus, RefreshCw, LayoutGrid, List,
    Pause, Play, Copy, Settings, MoreHorizontal, AlertTriangle,
    Zap, CheckCircle, XCircle
} from 'lucide-react'
import { useAgents, usePauseAgent, useResumeAgent, useCloneAgent } from '@/hooks/use-agents'
import { useQueryClient } from '@tanstack/react-query'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AgentStatusBadge } from '@/components/agents/AgentStatusBadge'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { CreateAgentDialog } from '@/components/agents/CreateAgentDialog'
import { cn } from '@/lib/utils'
import type { Agent } from '@/types/agent'

function AgentCard({ agent }: { agent: Agent }) {
    const router = useRouter()
    const pause = usePauseAgent()
    const resume = useResumeAgent()
    const clone = useCloneAgent()

    const successRate =
        agent.total_tasks_completed + agent.total_tasks_failed > 0
            ? Math.round(
                  (agent.total_tasks_completed /
                      (agent.total_tasks_completed + agent.total_tasks_failed)) *
                      100,
              )
            : null

    return (
        <div
            className="group border border-border rounded-xl p-4 bg-card hover:bg-accent/20 transition-all hover:border-primary/20 cursor-pointer"
            onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                    <AgentAvatar name={agent.name} color={agent.color} avatarUrl={agent.avatar_url} />
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate">{agent.name}</h3>
                        {agent.description && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {agent.description}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <AgentStatusBadge status={agent.status} />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/dashboard/agents/${agent.id}`)}>
                                <Settings className="w-4 h-4 mr-2" />
                                Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => clone.mutate({ agentId: agent.id })}>
                                <Copy className="w-4 h-4 mr-2" />
                                Clone
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {agent.status === 'paused' ? (
                                <DropdownMenuItem onClick={() => resume.mutate(agent.id)}>
                                    <Play className="w-4 h-4 mr-2" />
                                    Resume
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem onClick={() => pause.mutate(agent.id)}>
                                    <Pause className="w-4 h-4 mr-2" />
                                    Pause
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Type badge */}
            <div className="mb-3">
                <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
                    style={{
                        backgroundColor: `${agent.color ?? '#6366f1'}20`,
                        color: agent.color ?? '#6366f1',
                    }}
                >
                    {agent.agent_type}
                </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    <span>{agent.total_tasks_completed}</span>
                </div>
                <div className="flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-red-400" />
                    <span>{agent.total_tasks_failed}</span>
                </div>
                {successRate !== null && (
                    <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>{successRate}%</span>
                    </div>
                )}
                {agent.total_tokens_used > 0 && (
                    <div className="ml-auto text-muted-foreground/50">
                        {(agent.total_tokens_used / 1000).toFixed(1)}k tokens
                    </div>
                )}
            </div>
        </div>
    )
}

export default function AgentsPage() {
    const { data: agents = [], isLoading } = useAgents()
    const qc = useQueryClient()
    const [view, setView] = useState<'grouped' | 'grid'>('grouped')
    const [createOpen, setCreateOpen] = useState(false)

    const workingAgents = agents.filter((a) => a.status === 'working')
    const idleAgents = agents.filter((a) => a.status === 'idle' && a.is_active)
    const pausedAgents = agents.filter((a) => a.status === 'paused')
    const errorAgents = agents.filter((a) => a.status === 'error')
    const offlineAgents = agents.filter((a) => a.status === 'offline' || !a.is_active)

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <header className="flex h-16 shrink-0 items-center gap-2 px-4 border-b border-border">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 !h-4" />
                <div className="flex items-center gap-3 flex-1">
                    <Bot className="w-5 h-5 text-primary" />
                    <h1 className="text-base font-bold">Agents</h1>
                    <span className="text-xs text-muted-foreground px-2 py-0.5 bg-accent rounded-full">
                        {agents.filter((a) => a.is_active).length}
                    </span>
                    {workingAgents.length > 0 && (
                        <span className="text-xs text-green-400 px-2 py-0.5 bg-green-400/10 rounded-full">
                            {workingAgents.length} working
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => qc.invalidateQueries({ queryKey: ['agents'] })}
                        className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <div className="flex items-center border border-border rounded-lg overflow-hidden">
                        <button
                            onClick={() => setView('grouped')}
                            className={cn('p-1.5 transition-colors', view === 'grouped' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setView('grid')}
                            className={cn('p-1.5 transition-colors', view === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" />
                        New Agent
                    </Button>
                </div>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                {isLoading ? (
                    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                        Loading agents...
                    </div>
                ) : agents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                        <Bot className="w-12 h-12 mb-4 opacity-30" />
                        <h3 className="text-sm font-semibold mb-1">No agents yet</h3>
                        <p className="text-xs text-center max-w-sm mb-4">
                            Create your first agent to enable AI-powered task processing.
                        </p>
                        <Button size="sm" onClick={() => setCreateOpen(true)}>
                            <Plus className="w-4 h-4 mr-1" />
                            Create Agent
                        </Button>
                    </div>
                ) : view === 'grid' ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {agents.filter((a) => a.is_active).map((agent) => (
                            <AgentCard key={agent.id} agent={agent} />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-8 max-w-5xl">
                        {workingAgents.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    <h2 className="text-xs font-bold text-green-400 uppercase tracking-wider">
                                        Working ({workingAgents.length})
                                    </h2>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {workingAgents.map((a) => <AgentCard key={a.id} agent={a} />)}
                                </div>
                            </section>
                        )}

                        {idleAgents.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-2 h-2 rounded-full bg-zinc-400" />
                                    <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                        Idle ({idleAgents.length})
                                    </h2>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {idleAgents.map((a) => <AgentCard key={a.id} agent={a} />)}
                                </div>
                            </section>
                        )}

                        {pausedAgents.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                                    <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                                        Paused ({pausedAgents.length})
                                    </h2>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {pausedAgents.map((a) => <AgentCard key={a.id} agent={a} />)}
                                </div>
                            </section>
                        )}

                        {errorAgents.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                    <h2 className="text-xs font-bold text-red-400 uppercase tracking-wider">
                                        Error ({errorAgents.length})
                                    </h2>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {errorAgents.map((a) => <AgentCard key={a.id} agent={a} />)}
                                </div>
                            </section>
                        )}

                        {offlineAgents.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-2 h-2 rounded-full bg-zinc-600" />
                                    <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                                        Offline ({offlineAgents.length})
                                    </h2>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {offlineAgents.map((a) => <AgentCard key={a.id} agent={a} />)}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>

            <CreateAgentDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onCreated={() => qc.invalidateQueries({ queryKey: ['agents'] })}
            />
        </div>
    )
}
