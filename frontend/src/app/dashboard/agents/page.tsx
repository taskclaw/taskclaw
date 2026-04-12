'use client'

import { useState, useMemo } from 'react'
import { Bot, Sparkles, AlertTriangle, Zap, LayoutGrid, RefreshCw, Plus, Search } from 'lucide-react'
import { useAgentsDashboard } from '@/hooks/use-agents'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { BoardIcon } from '@/lib/board-icon'
import { ViewToggle } from '@/components/view-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLayout, PageHeader, PageFilterBar, PageSidebar, PageContent } from '@/components/page-layout'
import type { AgentDashboardItem } from '@/types/board'

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
    working:    { label: 'Working',  color: '#22c55e', dot: 'bg-green-500 animate-pulse' },
    idle:       { label: 'Idle',     color: '#71717a', dot: 'bg-zinc-500' },
    error:      { label: 'Error',    color: '#ef4444', dot: 'bg-red-500' },
    not_synced: { label: 'Sync',     color: '#f59e0b', dot: 'bg-amber-500' },
}

// ─── Card view ────────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentDashboardItem }) {
    const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle

    return (
        <a
            href={`/dashboard/agents/${agent.id}`}
            className="group flex flex-col border border-border rounded-xl p-4 bg-card hover:bg-accent/30 hover:border-primary/30 transition-all cursor-pointer"
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${agent.color || '#6366f1'}20`, color: agent.color || '#6366f1' }}
                    >
                        <BoardIcon name={agent.icon} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{agent.name}</p>
                        {agent.description && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{agent.description}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className={cn('w-1.5 h-1.5 rounded-full', statusCfg.dot)} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: statusCfg.color }}>
                        {statusCfg.label}
                    </span>
                </div>
            </div>

            <div className="flex flex-wrap gap-1 mb-3 flex-1">
                {agent.skill_names.slice(0, 3).map((name) => (
                    <span key={name} className="text-[10px] px-2 py-0.5 bg-accent/50 border border-border rounded-full text-muted-foreground">
                        {name}
                    </span>
                ))}
                {agent.skill_names.length > 3 && (
                    <span className="text-[10px] px-1 py-0.5 text-muted-foreground/60">+{agent.skill_names.length - 3}</span>
                )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border/50">
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />{agent.active_task_count}
                    </span>
                    {agent.active_conversations > 0 && (
                        <span className="flex items-center gap-1 text-green-400">
                            <Sparkles className="w-3 h-3" />{agent.active_conversations}
                        </span>
                    )}
                </div>
                <span className="text-muted-foreground/50">{agent.skill_count} skill{agent.skill_count !== 1 ? 's' : ''}</span>
            </div>
        </a>
    )
}

// ─── List row view ────────────────────────────────────────────────────────────

function AgentRow({ agent }: { agent: AgentDashboardItem }) {
    const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle

    return (
        <a
            href={`/dashboard/agents/${agent.id}`}
            className="flex items-center gap-4 px-4 py-3 border-b border-border hover:bg-accent/30 transition-colors"
        >
            <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${agent.color || '#6366f1'}20`, color: agent.color || '#6366f1' }}
            >
                <BoardIcon name={agent.icon} className="w-3.5 h-3.5" />
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{agent.name}</p>
                {agent.description && (
                    <p className="text-[11px] text-muted-foreground truncate">{agent.description}</p>
                )}
            </div>

            <div className="flex flex-wrap gap-1 max-w-[200px] hidden md:flex">
                {agent.skill_names.slice(0, 2).map((name) => (
                    <span key={name} className="text-[10px] px-2 py-0.5 bg-accent/50 border border-border rounded-full text-muted-foreground">
                        {name}
                    </span>
                ))}
                {agent.skill_names.length > 2 && (
                    <span className="text-[10px] text-muted-foreground/60">+{agent.skill_names.length - 2}</span>
                )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn('w-1.5 h-1.5 rounded-full', statusCfg.dot)} />
                <span className="text-[10px] font-semibold uppercase tracking-wider hidden sm:block" style={{ color: statusCfg.color }}>
                    {statusCfg.label}
                </span>
            </div>

            <div className="text-[10px] text-muted-foreground shrink-0 hidden lg:block">
                {agent.skill_count} skill{agent.skill_count !== 1 ? 's' : ''}
            </div>
        </a>
    )
}

// ─── Sidebar filter ───────────────────────────────────────────────────────────

const STATUS_FILTERS = [
    { id: 'all', label: 'All Agents' },
    { id: 'working', label: 'Working', dot: 'bg-green-500' },
    { id: 'idle', label: 'Idle', dot: 'bg-zinc-500' },
    { id: 'not_synced', label: 'Not Synced', dot: 'bg-amber-500' },
    { id: 'error', label: 'Error', dot: 'bg-red-500' },
] as const

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentsPage() {
    const { data: agents = [], isLoading } = useAgentsDashboard()
    const qc = useQueryClient()
    const [view, setView] = useState<'grid' | 'list'>('grid')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [search, setSearch] = useState('')

    const filtered = useMemo(() => {
        let list = agents
        if (statusFilter !== 'all') list = list.filter((a) => a.status === statusFilter)
        if (search.trim()) {
            const q = search.toLowerCase()
            list = list.filter((a) => a.name.toLowerCase().includes(q) || a.skill_names.some((s) => s.toLowerCase().includes(q)))
        }
        return list
    }, [agents, statusFilter, search])

    const counts = useMemo(() => ({
        all: agents.length,
        working: agents.filter((a) => a.status === 'working').length,
        idle: agents.filter((a) => a.status === 'idle').length,
        not_synced: agents.filter((a) => a.status === 'not_synced').length,
        error: agents.filter((a) => a.status === 'error').length,
    }), [agents])

    return (
        <PageLayout
            header={
                <PageHeader
                    icon={<Bot className="w-4 h-4 text-primary" />}
                    title="Agents"
                    meta={
                        <>
                            <span className="text-xs text-muted-foreground px-2 py-0.5 bg-accent rounded-full">{agents.length}</span>
                            {counts.working > 0 && (
                                <span className="text-xs text-green-400 px-2 py-0.5 bg-green-400/10 rounded-full">{counts.working} active</span>
                            )}
                        </>
                    }
                    actions={
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => qc.invalidateQueries({ queryKey: ['agentsDashboard'] })}
                            title="Refresh"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    }
                />
            }
            filterBar={
                <PageFilterBar
                    left={
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search agents..."
                                className="pl-8 h-8 w-56 text-sm"
                            />
                        </div>
                    }
                    right={<ViewToggle mode={view} onChange={setView} />}
                />
            }
            sidebar={
                <PageSidebar>
                    <div className="px-3 pt-4 pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 mb-1">Status</p>
                        {STATUS_FILTERS.map((f) => {
                            const count = counts[f.id as keyof typeof counts] ?? agents.length
                            return (
                                <button
                                    key={f.id}
                                    onClick={() => setStatusFilter(f.id)}
                                    className={cn(
                                        'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
                                        statusFilter === f.id
                                            ? 'bg-primary/10 text-primary font-medium'
                                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                    )}
                                >
                                    <span className="flex items-center gap-2">
                                        {'dot' in f && <span className={cn('w-1.5 h-1.5 rounded-full', f.dot)} />}
                                        {f.label}
                                    </span>
                                    <span className="text-[10px]">{count}</span>
                                </button>
                            )
                        })}
                    </div>
                </PageSidebar>
            }
        >
            <PageContent className="p-4">
                {isLoading ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                        Loading agents...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                        <Bot className="w-10 h-10 mb-3 opacity-20" />
                        <p className="text-sm">{search ? 'No agents match your search' : 'No agents in this category'}</p>
                    </div>
                ) : view === 'grid' ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {filtered.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
                    </div>
                ) : (
                    <div className="rounded-xl border border-border overflow-hidden">
                        <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 border-b border-border">
                            <div className="w-8 shrink-0" />
                            <p className="flex-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Agent</p>
                            <p className="hidden md:block w-[200px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Skills</p>
                            <p className="shrink-0 w-24 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</p>
                            <p className="hidden lg:block shrink-0 w-16 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Skills</p>
                        </div>
                        {filtered.map((agent) => <AgentRow key={agent.id} agent={agent} />)}
                    </div>
                )}
            </PageContent>
        </PageLayout>
    )
}
