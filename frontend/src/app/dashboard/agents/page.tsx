'use client'

import { useState } from 'react'
import { Bot, Sparkles, AlertTriangle, Zap, LayoutGrid, List, RefreshCw } from 'lucide-react'
import { useAgentsDashboard } from '@/hooks/use-agents'
import { useQueryClient } from '@tanstack/react-query'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { AgentDashboardItem } from '@/types/board'

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
    working: { label: 'Working', color: '#22c55e', dot: 'bg-green-500 animate-pulse' },
    idle: { label: 'Idle', color: '#71717a', dot: 'bg-zinc-500' },
    error: { label: 'Error', color: '#ef4444', dot: 'bg-red-500' },
    not_synced: { label: 'Not Synced', color: '#f59e0b', dot: 'bg-amber-500' },
}

function AgentCard({ agent }: { agent: AgentDashboardItem }) {
    const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle

    return (
        <div className="group border border-border rounded-xl p-4 bg-card hover:bg-accent/30 transition-all hover:border-border/80">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
                        style={{ backgroundColor: `${agent.color || '#6366f1'}20` }}
                    >
                        {agent.icon || <Bot className="w-4 h-4" style={{ color: agent.color || '#6366f1' }} />}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate">{agent.name}</h3>
                        {agent.description && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {agent.description}
                            </p>
                        )}
                    </div>
                </div>

                {/* Status indicator */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn('w-2 h-2 rounded-full', statusCfg.dot)} />
                    <span
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: statusCfg.color }}
                    >
                        {statusCfg.label}
                    </span>
                </div>
            </div>

            {/* Skills list */}
            <div className="flex flex-wrap gap-1 mb-3">
                {agent.skill_names.slice(0, 3).map((name) => (
                    <span
                        key={name}
                        className="text-[10px] px-2 py-0.5 bg-accent/50 border border-border rounded-full text-muted-foreground"
                    >
                        {name}
                    </span>
                ))}
                {agent.skill_names.length > 3 && (
                    <span className="text-[10px] px-2 py-0.5 text-muted-foreground/60">
                        +{agent.skill_names.length - 3} more
                    </span>
                )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    <span>{agent.active_task_count} task{agent.active_task_count !== 1 ? 's' : ''}</span>
                </div>
                {agent.active_conversations > 0 && (
                    <div className="flex items-center gap-1 text-green-400">
                        <Sparkles className="w-3 h-3" />
                        <span>{agent.active_conversations} active</span>
                    </div>
                )}
                {agent.boards.length > 0 && (
                    <div className="flex items-center gap-1">
                        <LayoutGrid className="w-3 h-3" />
                        <span className="truncate max-w-[120px]">{agent.boards.join(', ')}</span>
                    </div>
                )}
            </div>

            {/* Sync status */}
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px]">
                    {agent.sync_status === 'synced' ? (
                        <span className="text-green-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            Synced
                        </span>
                    ) : agent.sync_status === 'error' ? (
                        <span className="text-red-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Sync Error
                        </span>
                    ) : (
                        <span className="text-amber-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            {agent.sync_status === 'none' ? 'Not synced' : agent.sync_status}
                        </span>
                    )}
                    {agent.last_synced_at && (
                        <span className="text-muted-foreground/50">
                            {new Date(agent.last_synced_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </span>
                    )}
                </div>
                <span className="text-[10px] text-muted-foreground/50">
                    {agent.skill_count} skill{agent.skill_count !== 1 ? 's' : ''}
                </span>
            </div>
        </div>
    )
}

export default function AgentsPage() {
    const { data: agents = [], isLoading } = useAgentsDashboard()
    const qc = useQueryClient()
    const [view, setView] = useState<'grouped' | 'grid'>('grouped')

    const workingAgents = agents.filter((a) => a.status === 'working')
    const idleAgents = agents.filter((a) => a.status === 'idle')
    const errorAgents = agents.filter((a) => a.status === 'error' || a.status === 'not_synced')

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center gap-2 px-4 border-b border-border">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 !h-4" />
                <div className="flex items-center gap-3 flex-1">
                    <Bot className="w-5 h-5 text-primary" />
                    <h1 className="text-base font-bold">Agents</h1>
                    <span className="text-xs text-muted-foreground px-2 py-0.5 bg-accent rounded-full">
                        {agents.length}
                    </span>
                    {workingAgents.length > 0 && (
                        <span className="text-xs text-green-400 px-2 py-0.5 bg-green-400/10 rounded-full">
                            {workingAgents.length} active
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => qc.invalidateQueries({ queryKey: ['agentsDashboard'] })}
                        className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <div className="flex items-center border border-border rounded-lg overflow-hidden">
                        <button
                            onClick={() => setView('grouped')}
                            className={cn(
                                'p-1.5 transition-colors',
                                view === 'grouped' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setView('grid')}
                            className={cn(
                                'p-1.5 transition-colors',
                                view === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                {isLoading ? (
                    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                        Loading agents...
                    </div>
                ) : agents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                        <Bot className="w-12 h-12 mb-4 opacity-30" />
                        <h3 className="text-sm font-semibold mb-1">No agents configured</h3>
                        <p className="text-xs text-center max-w-sm">
                            Create an agent and link skills to it to enable AI-powered task processing.
                        </p>
                    </div>
                ) : view === 'grid' ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {agents.map((agent) => (
                            <AgentCard key={agent.id} agent={agent} />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Working */}
                        {workingAgents.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    <h2 className="text-xs font-bold text-green-400 uppercase tracking-wider">
                                        Working ({workingAgents.length})
                                    </h2>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {workingAgents.map((agent) => (
                                        <AgentCard key={agent.id} agent={agent} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Idle */}
                        {idleAgents.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-2 h-2 rounded-full bg-zinc-500" />
                                    <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                        Idle ({idleAgents.length})
                                    </h2>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {idleAgents.map((agent) => (
                                        <AgentCard key={agent.id} agent={agent} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Error / Not Synced */}
                        {errorAgents.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                    <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                                        Needs Attention ({errorAgents.length})
                                    </h2>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {errorAgents.map((agent) => (
                                        <AgentCard key={agent.id} agent={agent} />
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
