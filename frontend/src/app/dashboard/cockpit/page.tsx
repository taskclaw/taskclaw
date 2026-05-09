'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePods, usePodBoards, useAllBoards, useDeletePod } from '@/hooks/use-pods'
import { useAgents, usePauseAgent, useResumeAgent } from '@/hooks/use-agents'
import { CreatePodDialog } from '@/components/pods/create-pod-dialog'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
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
    Bot,
    Play,
    ChevronDown,
    ChevronRight,
    Loader2,
    MessageCircle,
    Settings,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    Zap,
    Plus,
    Layers,
    Activity,
    RefreshCw,
    Send,
    ArrowLeft,
    LayoutGrid,
    Users,
    Minus,
    Globe,
    Rocket,
    Twitter,
    Search,
    Palette,
    type LucideIcon,
} from 'lucide-react'

// ── Lucide icon string → component map ──────────────────────────────────────
// Icons stored in DB as slugs (e.g. "globe", "layers") are resolved here.
// Emoji strings (length 1-2, non-ascii) are rendered as-is in a <span>.

const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
    globe: Globe,
    layers: Layers,
    twitter: Twitter,
    rocket: Rocket,
    search: Search,
    palette: Palette,
    bot: Bot,
    settings: Settings,
    activity: Activity,
    'layout-grid': LayoutGrid,
    layoutgrid: LayoutGrid,
    users: Users,
    plus: Plus,
    zap: Zap,
    'message-circle': MessageCircle,
    messagecircle: MessageCircle,
}

function IconFromString({
    icon,
    fallback: Fallback,
    className,
    style,
}: {
    icon?: string | null
    fallback: LucideIcon
    className?: string
    style?: React.CSSProperties
}) {
    if (!icon) return <Fallback className={className} style={style} />
    const slug = icon.toLowerCase().replace(/\s+/g, '-')
    const Matched = LUCIDE_ICON_MAP[slug]
    if (Matched) return <Matched className={className} style={style} />
    // Assume emoji / plain char
    return <span className="text-sm leading-none select-none">{icon}</span>
}
import { toast } from 'sonner'
import { useBackboneConnections } from '@/hooks/use-backbone-connections'
import {
    getPilotConfig,
    upsertPilotConfig,
    runPilot,
    getExecutionLog,
    type PilotConfig,
} from '@/app/dashboard/pods/actions'
import {
    createConversation,
    sendMessageBackground,
    getMessages,
} from '@/app/dashboard/chat/actions'
import type { ExecutionLog, Pod } from '@/types/pod'
import type { Board } from '@/types/board'
import type { Agent } from '@/types/agent'
import { formatDistanceToNow, isToday, isYesterday } from 'date-fns'
import { cn } from '@/lib/utils'
import { renderMarkdown } from '@/lib/markdown'
import { type DelegationMeta } from '@/components/orchestration/cockpit-execution-feed'
import { CockpitRightPanel } from '@/components/orchestration/cockpit-right-panel'
import { TaskDetailPanel } from '@/components/tasks/task-detail-panel'
import { useTaskStore } from '@/hooks/use-task-store'
import { useBlockedTasks } from '@/hooks/use-blocked-tasks'

// ── Types ──────────────────────────────────────────────────────────────────

interface Message {
    id?: string
    role: 'user' | 'assistant' | 'system'
    content: string
    created_at?: string
    metadata?: Record<string, any>
}

interface SessionDetail {
    log: ExecutionLog
    conversationId: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getStoredPanels(): { agents: boolean; timeline: boolean } {
    if (typeof window === 'undefined') return { agents: true, timeline: true }
    try {
        const raw = localStorage.getItem('cockpit-panels')
        if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return { agents: true, timeline: true }
}

function storePanels(v: { agents: boolean; timeline: boolean }) {
    try { localStorage.setItem('cockpit-panels', JSON.stringify(v)) } catch { /* ignore */ }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function CockpitPage() {
    const { data: pods } = usePods()
    const { data: agents } = useAgents()
    const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
    const deletePod = useDeletePod()
    const [showCreate, setShowCreate] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    // Panel open/close (persisted)
    const [panels, setPanels] = useState<{ agents: boolean; timeline: boolean }>({ agents: true, timeline: true })
    useEffect(() => { setPanels(getStoredPanels()) }, [])
    const togglePanel = (key: 'agents' | 'timeline') => {
        setPanels(prev => {
            const next = { ...prev, [key]: !prev[key] }
            storePanels(next)
            return next
        })
    }

    // Conversation state (shared across Command Center + Timeline "Continue session")
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
    const [openFreshChat, setOpenFreshChat] = useState(false)
    // Lifted delegations state — passed to CockpitRightPanel
    const [allDelegations, setAllDelegations] = useState<DelegationMeta[]>([])
    const [cockpitAccountId, setCockpitAccountId] = useState<string | null>(null)

    // Blocked tasks — Realtime subscription feeds into CockpitRightPanel alert section
    const { blockedTasks } = useBlockedTasks(cockpitAccountId)

    // Read account ID from cookie client-side
    useEffect(() => {
        if (typeof document !== 'undefined') {
            const m = document.cookie.match(/current_account_id=([^;]+)/)
            setCockpitAccountId(m ? m[1] : null)
        }
    }, [])

    // Session detail view — when a timeline entry is clicked
    const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null)

    const handleContinueSession = (log: ExecutionLog) => {
        // Show session detail in right panel
        setSessionDetail({ log, conversationId: log.conversation_id ?? null })
        // Load conversation in center panel
        if (log.conversation_id) {
            setActiveConversationId(log.conversation_id)
        } else {
            setOpenFreshChat(true)
        }
    }

    const handleDelete = (pod: Pod) => {
        setDeleteTarget({ id: pod.id, name: pod.name })
    }
    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const result = await deletePod.mutateAsync(deleteTarget.id)
            if (result.error) toast.error(result.error)
            else { setDeleteTarget(null); toast.success('Pod deleted') }
        } catch (e: any) {
            toast.error(e.message || 'Failed to delete pod')
        } finally {
            setDeleteLoading(false)
        }
    }

    const activeAgents = (agents as Agent[] | undefined)?.filter(a => a.is_active) ?? []

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden relative">
            {/* Blueprint grid background */}
            <div
                className="pointer-events-none fixed inset-0 z-0 opacity-[0.15]"
                style={{
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                }}
            />
            {/* Ambient orbs */}
            <div className="pointer-events-none fixed top-1/4 left-1/3 w-96 h-96 rounded-full z-0"
                style={{ background: 'rgba(143,245,255,0.04)', filter: 'blur(120px)' }} />
            <div className="pointer-events-none fixed bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full z-0"
                style={{ background: 'rgba(255,81,250,0.03)', filter: 'blur(160px)' }} />

            {/* Header */}
            <header className="relative z-10 flex h-14 shrink-0 items-center gap-2 px-4 bg-background/80 backdrop-blur-sm border-b border-white/5">
                <SidebarTrigger className="-ml-1" />
                <div className="w-px h-4 bg-border/50" />
                <h1 className="text-sm font-bold tracking-wide flex-1">
                    <span className="text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase font-medium block leading-none mb-0.5">Workspace</span>
                    Cockpit
                </h1>
                {activeAgents.length > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-white/5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-medium text-muted-foreground">{activeAgents.length} agent{activeAgents.length !== 1 ? 's' : ''} active</span>
                    </div>
                )}
                <button
                    onClick={() => togglePanel('agents')}
                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
                    title={panels.agents ? 'Hide agents panel' : 'Show agents panel'}
                >
                    {panels.agents ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                </button>
                <button
                    onClick={() => togglePanel('timeline')}
                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
                    title={panels.timeline ? 'Hide timeline' : 'Show timeline'}
                >
                    {panels.timeline ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                </button>
            </header>

            {/* Three-column body */}
            <div className="relative z-10 flex flex-1 min-h-0 overflow-hidden">
                {/* Left: Agents Panel */}
                <div
                    className={cn(
                        'flex-shrink-0 overflow-hidden transition-all duration-500 ease-in-out',
                        panels.agents ? 'w-[240px] opacity-100' : 'w-0 opacity-0'
                    )}
                >
                    <AgentsPanel
                        pods={pods || []}
                        agents={(agents as Agent[] | undefined) || []}
                        onNewPod={() => setShowCreate(true)}
                        onDeletePod={handleDelete}
                    />
                </div>

                {/* Center: Command Center */}
                <div className="flex-1 min-w-0 flex flex-col border-x border-white/5 bg-background/40 backdrop-blur-sm">
                    <CommandCenter
                        activeConversationId={activeConversationId}
                        onConversationChange={setActiveConversationId}
                        openFreshChat={openFreshChat}
                        onFreshChatConsumed={() => setOpenFreshChat(false)}
                        onNewPod={() => setShowCreate(true)}
                        onOpenTimeline={() => { if (!panels.timeline) togglePanel('timeline') }}
                        onDelegationsChange={setAllDelegations}
                    />
                </div>

                {/* Right: Timeline or Session Detail — wrapped in CockpitRightPanel */}
                <div
                    className={cn(
                        'flex-shrink-0 overflow-hidden transition-all duration-500 ease-in-out',
                        panels.timeline ? 'w-[320px] opacity-100' : 'w-0 opacity-0'
                    )}
                >
                    {sessionDetail ? (
                        <SessionDetailView
                            detail={sessionDetail}
                            onBack={() => setSessionDetail(null)}
                            onOpenConversation={(convId) => {
                                setSessionDetail(null)
                                if (convId) setActiveConversationId(convId)
                                else setOpenFreshChat(true)
                            }}
                        />
                    ) : (
                        <CockpitRightPanel
                            sessionDelegations={allDelegations}
                            accountId={cockpitAccountId}
                            blockedTasks={blockedTasks}
                        >
                            <WorkspaceTimeline onSelectLog={handleContinueSession} />
                        </CockpitRightPanel>
                    )}
                </div>
            </div>

            {selectedTaskId && <TaskDetailPanel />}
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

// ── Agents Panel ───────────────────────────────────────────────────────────

interface AgentsPanelProps {
    pods: Pod[]
    agents: Agent[]
    onNewPod: () => void
    onDeletePod: (pod: Pod) => void
}

type AccordionSection = 'agents' | 'pods' | 'boards'

function AgentsPanel({ pods, agents, onNewPod }: AgentsPanelProps) {
    const [pilotOpen, setPilotOpen] = useState(false)
    // Single-open accordion — only one section open at a time. Boards is default.
    const [openSection, setOpenSection] = useState<AccordionSection>('boards')

    const toggle = (section: AccordionSection) => {
        setOpenSection(prev => prev === section ? prev : section)
    }
    const open = {
        agents: openSection === 'agents',
        pods: openSection === 'pods',
        boards: openSection === 'boards',
    }

    return (
        <div className="h-full flex flex-col bg-background/60 backdrop-blur-sm border-r border-white/5">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5">
                <h2 className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/60 uppercase">Workspace Resources</h2>
            </div>

            {/* Accordion list */}
            <div className="flex-1 overflow-y-auto custom-cockpit-scroll">
                {/* Pods section */}
                <AccordionSection
                    label="Pods"
                    icon={<Layers className="w-3.5 h-3.5" />}
                    count={pods.length}
                    isOpen={open.pods}
                    onToggle={() => toggle('pods')}
                >
                    {pods.length === 0 ? (
                        <div className="px-4 py-3 text-[10px] text-muted-foreground/40">No pods yet</div>
                    ) : (
                        pods.map(pod => <PodAccordionRow key={pod.id} pod={pod} />)
                    )}
                </AccordionSection>

                {/* Boards section (default open) */}
                <AccordionSection
                    label="Boards"
                    icon={<LayoutGrid className="w-3.5 h-3.5" />}
                    isOpen={open.boards}
                    onToggle={() => toggle('boards')}
                >
                    <BoardsAccordionContent />
                </AccordionSection>

                {/* Agents section (last) */}
                <AccordionSection
                    label="Agents"
                    icon={<Users className="w-3.5 h-3.5" />}
                    count={agents.length}
                    isOpen={open.agents}
                    onToggle={() => toggle('agents')}
                >
                    {agents.length === 0 ? (
                        <div className="px-4 py-3 text-[10px] text-muted-foreground/40">No agents deployed</div>
                    ) : (
                        agents.map(agent => <AgentAccordionRow key={agent.id} agent={agent} />)
                    )}
                </AccordionSection>
            </div>

            {/* Footer */}
            <div className="border-t border-white/5 p-3 space-y-1">
                {/* Pilot settings toggle */}
                <button
                    onClick={() => setPilotOpen(v => !v)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:bg-accent/50 transition-colors text-xs"
                >
                    <Settings className="w-3.5 h-3.5" />
                    <span className="flex-1 text-left">Pilot Settings</span>
                    {pilotOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {pilotOpen && <PilotSettingsInline />}

                <button
                    onClick={onNewPod}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors text-xs border border-dashed border-white/10"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Deploy new pod
                </button>
            </div>
        </div>
    )
}

// ── Accordion Section wrapper ──────────────────────────────────────────────

function AccordionSection({
    label,
    icon,
    count,
    isOpen,
    onToggle,
    children,
}: {
    label: string
    icon: React.ReactNode
    count?: number
    isOpen: boolean
    onToggle: () => void
    children: React.ReactNode
}) {
    return (
        <div className="border-b border-white/5">
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/10 transition-colors group"
            >
                <span className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">{icon}</span>
                <span className="flex-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">{label}</span>
                {count !== undefined && (
                    <span className="text-[9px] bg-muted/40 px-1.5 py-0.5 rounded text-muted-foreground/50">{count}</span>
                )}
                <span className="text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors">
                    {isOpen ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                </span>
            </button>
            <div
                className="overflow-hidden transition-all duration-300"
                style={{ maxHeight: isOpen ? '600px' : '0px' }}
            >
                {children}
            </div>
        </div>
    )
}

// ── Agent row ──────────────────────────────────────────────────────────────

function AgentAccordionRow({ agent }: { agent: Agent }) {
    const pauseAgent = usePauseAgent()
    const resumeAgent = useResumeAgent()
    const isActive = agent.is_active
    const isPending = pauseAgent.isPending || resumeAgent.isPending

    const statusColor = {
        working: '#8ff5ff',
        idle: 'rgba(255,255,255,0.25)',
        paused: '#ffd16f',
        error: 'rgb(var(--destructive))',
        offline: 'rgba(255,255,255,0.1)',
    }[agent.status] ?? 'rgba(255,255,255,0.15)'

    const handleToggle = async (checked: boolean) => {
        try {
            if (checked) await resumeAgent.mutateAsync(agent.id)
            else await pauseAgent.mutateAsync(agent.id)
        } catch {
            toast.error('Failed to update agent')
        }
    }

    return (
        <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/10 transition-colors group">
            {/* Status pip */}
            <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                    background: statusColor,
                    boxShadow: agent.status === 'working' ? `0 0 6px ${statusColor}` : 'none',
                }}
                title={agent.status}
            />
            {/* Avatar / Icon */}
            <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                style={{
                    background: `${agent.color || '#8ff5ff'}18`,
                    border: `1px solid ${agent.color || '#8ff5ff'}30`,
                    color: agent.color || '#8ff5ff',
                }}
            >
                {agent.avatar_url ? (
                    <img src={agent.avatar_url} alt={agent.name} className="w-full h-full rounded-lg object-cover" />
                ) : (
                    <span className="text-xs leading-none">{agent.name.charAt(0).toUpperCase()}</span>
                )}
            </div>
            {/* Name + metrics */}
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold truncate leading-tight">{agent.name}</p>
                <p className="text-[9px] text-muted-foreground/50 truncate leading-tight">
                    {agent.total_tasks_completed ?? 0} tasks · {agent.total_tokens_used != null ? `${Math.round((agent.total_tokens_used / 1000))}k tok` : '—'}
                </p>
            </div>
            {/* Enable/disable toggle */}
            <Switch
                checked={isActive}
                onCheckedChange={handleToggle}
                disabled={isPending}
                className="scale-75 shrink-0"
            />
        </div>
    )
}

// ── Pod row (expandable to show boards) ───────────────────────────────────

function PodAccordionRow({ pod }: { pod: Pod }) {
    const [expanded, setExpanded] = useState(false)
    const { data: boards } = usePodBoards(expanded ? pod.id : null)
    const color = pod.color || '#8ff5ff'

    return (
        <div>
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/10 transition-colors text-left group"
            >
                {/* Pod icon — wrap emoji in span to prevent raw render */}
                <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${color}18`, border: `1px solid ${color}30` }}
                >
                    <IconFromString icon={pod.icon} fallback={Bot} className="w-4 h-4" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate leading-tight">{pod.name}</p>
                    <p className="text-[9px] text-muted-foreground/50">
                        {pod.board_count ?? 0} board{pod.board_count !== 1 ? 's' : ''}
                    </p>
                </div>
                {/* Status pip */}
                <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: color, boxShadow: `0 0 5px ${color}60` }}
                />
                <span className="text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors">
                    {expanded ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                </span>
            </button>

            {/* Board sub-rows */}
            <div
                className="overflow-hidden transition-all duration-300 bg-muted/5"
                style={{ maxHeight: expanded ? '400px' : '0px' }}
            >
                {boards && boards.length > 0 ? (
                    (boards as Board[]).map(board => (
                        <div key={board.id} className="flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-muted/10 transition-colors">
                            <div
                                className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px]"
                                style={{ background: `${board.color || '#8ff5ff'}18` }}
                            >
                                <IconFromString icon={board.icon} fallback={LayoutGrid} className="w-3 h-3" style={{ color: board.color || '#8ff5ff' }} />
                            </div>
                            <p className="flex-1 text-[10px] text-muted-foreground/70 truncate">{board.name}</p>
                            {board.task_count != null && (
                                <span className="text-[9px] text-muted-foreground/40">{board.task_count} tasks</span>
                            )}
                        </div>
                    ))
                ) : expanded && !boards ? (
                    <div className="pl-8 pr-3 py-2 text-[10px] text-muted-foreground/30 animate-pulse">Loading…</div>
                ) : expanded ? (
                    <div className="pl-8 pr-3 py-2 text-[10px] text-muted-foreground/30">No boards</div>
                ) : null}
            </div>
        </div>
    )
}

// ── Boards-only section (flat list of all boards) ──────────────────────────

function BoardsAccordionContent() {
    const { data: boards, isLoading } = useAllBoards()

    if (isLoading) return (
        <div className="px-4 py-3 text-[10px] text-muted-foreground/30 animate-pulse">Loading…</div>
    )

    const boardList = (boards as Board[] | undefined) ?? []

    if (boardList.length === 0) return (
        <div className="px-4 py-3 text-[10px] text-muted-foreground/40">No boards</div>
    )

    return (
        <div>
            {boardList.map(board => (
                <div key={board.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/10 transition-colors">
                    <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs"
                        style={{ background: `${board.color || '#8ff5ff'}18`, border: `1px solid ${board.color || '#8ff5ff'}20` }}
                    >
                        <IconFromString icon={board.icon} fallback={LayoutGrid} className="w-3.5 h-3.5" style={{ color: board.color || '#8ff5ff' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate leading-tight">{board.name}</p>
                        {board.task_count != null && (
                            <p className="text-[9px] text-muted-foreground/40">{board.task_count} tasks</p>
                        )}
                    </div>
                    <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                            background: board.is_archived ? 'rgba(255,255,255,0.1)' : (board.color || '#8ff5ff'),
                            boxShadow: !board.is_archived ? `0 0 5px ${board.color || '#8ff5ff'}50` : 'none',
                        }}
                        title={board.is_archived ? 'Archived' : 'Active'}
                    />
                </div>
            ))}
        </div>
    )
}

// ── Pilot Settings (collapsed inside AgentsPanel footer) ───────────────────

function PilotSettingsInline() {
    const { data: backbones = [] } = useBackboneConnections()
    const [config, setConfig] = useState<PilotConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [running, setRunning] = useState(false)
    const [isActive, setIsActive] = useState(false)
    const [backboneId, setBackboneId] = useState('__default__')
    const [systemPrompt, setSystemPrompt] = useState('')

    useEffect(() => {
        getPilotConfig(null).then(cfg => {
            if (cfg) {
                setConfig(cfg)
                setIsActive(cfg.is_active)
                setBackboneId(cfg.backbone_connection_id || '__default__')
                setSystemPrompt(cfg.system_prompt || '')
            }
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [])

    async function handleSave() {
        setSaving(true)
        try {
            const result = await upsertPilotConfig({
                pod_id: null,
                is_active: isActive,
                backbone_connection_id: backboneId === '__default__' ? null : backboneId,
                system_prompt: systemPrompt,
                max_tasks_per_cycle: config?.max_tasks_per_cycle ?? 10,
                approval_required: config?.approval_required ?? true,
            })
            if (result.error) toast.error(result.error)
            else { toast.success('Pilot settings saved'); if (result.config) setConfig(result.config) }
        } finally {
            setSaving(false)
        }
    }

    async function handleRun() {
        if (!config?.is_active) { toast.error('Enable pilot first'); return }
        setRunning(true)
        try {
            const result = await runPilot(null)
            if (result.error) toast.error(`Pilot failed: ${result.error}`)
            else toast.success('Pilot cycle complete', { duration: 4000 })
        } finally {
            setRunning(false)
        }
    }

    if (loading) return <div className="px-3 py-2 text-[10px] text-muted-foreground/40 animate-pulse">Loading...</div>

    return (
        <div className="mx-1 mb-1 p-3 rounded-xl bg-muted/20 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
                <Label className="text-[10px] font-medium text-muted-foreground">Enable Pilot</Label>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Backbone</Label>
                <Select value={backboneId} onValueChange={setBackboneId}>
                    <SelectTrigger className="h-7 text-[11px]">
                        <SelectValue placeholder="Account default" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__default__">Account default</SelectItem>
                        {(backbones as any[]).map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>{b.name || b.adapter_slug}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">System Prompt</Label>
                <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="You are a workspace coordinator..."
                    className="text-[11px] min-h-[60px] resize-none"
                />
            </div>
            <div className="flex gap-1.5">
                <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 h-7 text-[11px]">
                    {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}Save
                </Button>
                <Button size="sm" variant="outline" onClick={handleRun} disabled={running || !config?.is_active} className="h-7 text-[11px]" title={!config?.is_active ? 'Enable pilot first' : 'Run one cycle'}>
                    {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                </Button>
            </div>
        </div>
    )
}

// ── Command Center ─────────────────────────────────────────────────────────

interface CommandCenterProps {
    activeConversationId: string | null
    onConversationChange: (id: string | null) => void
    openFreshChat?: boolean
    onFreshChatConsumed?: () => void
    onNewPod: () => void
    onOpenTimeline: () => void
    /** Called whenever delegations from message metadata change */
    onDelegationsChange?: (delegations: DelegationMeta[]) => void
}

function CommandCenter({ activeConversationId, onConversationChange, openFreshChat, onFreshChatConsumed, onNewPod, onOpenTimeline, onDelegationsChange }: CommandCenterProps) {
    const { data: backbones = [] } = useBackboneConnections()
    // Default to the is_default backbone; null = use account default (server resolves)
    const defaultBackboneId = (backbones as any[]).find((b: any) => b.is_default)?.id ?? null
    const [selectedBackboneId, setSelectedBackboneId] = useState<string | null>(null)
    // Sync once backbones load
    useEffect(() => {
        if (backbones && (backbones as any[]).length > 0 && selectedBackboneId === null) {
            const def = (backbones as any[]).find((b: any) => b.is_default)
            setSelectedBackboneId(def?.id ?? (backbones as any[])[0]?.id ?? null)
        }
    }, [backbones])

    const [input, setInput] = useState('')
    const [messages, setMessages] = useState<Message[]>([])
    const [isInitializing, setIsInitializing] = useState(false)
    const [isLoadingMessages, setIsLoadingMessages] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const isActive = !!activeConversationId

    const stopPolling = useCallback(() => {
        if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
    }, [])

    // When Timeline fires "Open chat" (no conversation_id), create a fresh workspace conversation
    useEffect(() => {
        if (!openFreshChat) return
        onFreshChatConsumed?.()
        setIsInitializing(true)
        createConversation('Workspace Chat', undefined, undefined, undefined, selectedBackboneId).then(conv => {
            setIsInitializing(false)
            if (conv?.id) onConversationChange(conv.id)
            else toast.error(conv?.error || 'Failed to start chat')
        })
    }, [openFreshChat, onConversationChange, onFreshChatConsumed])

    const loadMessages = useCallback(async (convId: string) => {
        setIsLoadingMessages(true)
        try {
            const result = await getMessages(convId)
            if (result?.data && Array.isArray(result.data) && result.data.length > 0) {
                const msgs: Message[] = result.data.map((m: any) => ({
                    id: m.id, role: m.role, content: m.content, created_at: m.created_at, metadata: m.metadata,
                }))
                setMessages(msgs)
                const last = msgs[msgs.length - 1]
                if (last?.role === 'user') setIsProcessing(true)
                else { setIsProcessing(false); stopPolling() }
            } else if (result?.data && Array.isArray(result.data) && result.data.length === 0) {
                // Empty thread — don't wipe existing messages
                setIsProcessing(false)
                stopPolling()
            }
        } catch { /* ignore */ }
        finally { setIsLoadingMessages(false) }
    }, [stopPolling])

    useEffect(() => {
        if (!activeConversationId) { setMessages([]); setIsProcessing(false); stopPolling(); return }
        loadMessages(activeConversationId)
    }, [activeConversationId, loadMessages, stopPolling])

    // Scroll to bottom when messages update
    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages])

    // Poll for AI response
    const startPolling = useCallback((convId: string) => {
        stopPolling()
        pollTimerRef.current = setInterval(() => { loadMessages(convId) }, 5000)
    }, [loadMessages, stopPolling])

    useEffect(() => { return stopPolling }, [stopPolling])

    async function handleSubmit() {
        const text = input.trim()
        if (!text) return

        setInput('')
        setError(null)

        if (activeConversationId) {
            // Already in active thread — send directly
            const optimistic: Message = { role: 'user', content: text, created_at: new Date().toISOString() }
            setMessages(prev => [...prev, optimistic])
            setIsSending(true)
            setIsProcessing(true)
            const result = await sendMessageBackground(activeConversationId, text)
            setIsSending(false)
            if (result.error) {
                setError(result.error)
                setMessages(prev => prev.filter(m => m !== optimistic))
                setIsProcessing(false)
            } else {
                startPolling(activeConversationId)
            }
        } else {
            // Create new conversation with this text as first message
            setIsInitializing(true)
            const conv = await createConversation('Workspace Chat', undefined, undefined, undefined, selectedBackboneId)
            if (!conv?.id) {
                setIsInitializing(false)
                toast.error(conv?.error || 'Failed to start chat')
                return
            }
            onConversationChange(conv.id)
            const optimistic: Message = { role: 'user', content: text, created_at: new Date().toISOString() }
            setMessages([optimistic])
            setIsInitializing(false)
            setIsSending(true)
            setIsProcessing(true)
            const result = await sendMessageBackground(conv.id, text)
            setIsSending(false)
            if (result.error) {
                setError(result.error)
                setMessages([])
                setIsProcessing(false)
                onConversationChange(null)
            } else {
                startPolling(conv.id)
            }
        }
    }

    // Collect all delegations from messages metadata
    const allDelegations: DelegationMeta[] = messages.flatMap(m =>
        (m.metadata?.delegations as DelegationMeta[] | undefined) ?? []
    )

    // Notify parent of delegation changes (for CockpitRightPanel)
    useEffect(() => {
        onDelegationsChange?.(allDelegations)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, onDelegationsChange])

    return (
        <div className="h-full flex flex-col min-h-0">
            {isActive ? (
                // ── Active state: chat thread ──────────────────────────────
                <>
                    {/* Thread header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-background/60">
                        <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/60 uppercase">Command Center</span>
                        <button
                            onClick={() => { onConversationChange(null); setMessages([]) }}
                            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-1"
                        >
                            <ArrowLeft className="w-3 h-3" />
                            New command
                        </button>
                    </div>

                    {/* Chat area (full width — execution feed moved to CockpitRightPanel) */}
                    <div className="flex flex-1 min-h-0">

                    {/* Messages + input */}
                    <div className="flex flex-col flex-1 min-h-0 min-w-0">

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto custom-cockpit-scroll px-4 py-4 space-y-4">
                        {isLoadingMessages && messages.length === 0 ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className={cn('flex gap-3', i % 2 === 0 ? 'justify-end' : '')}>
                                        {i % 2 !== 0 && <div className="w-7 h-7 rounded-full bg-muted/30 animate-pulse shrink-0" />}
                                        <div className={cn('h-12 rounded-2xl bg-muted/20 animate-pulse', i % 2 === 0 ? 'w-48' : 'flex-1 max-w-[280px]')} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            messages.map((msg, i) => (
                                <ChatMessage key={msg.id || i} message={msg} />
                            ))
                        )}
                        {isProcessing && (
                            <div className="flex gap-3 items-end">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                                    style={{ background: 'rgba(143,245,255,0.15)' }}>
                                    <Bot className="w-3.5 h-3.5" style={{ color: '#8ff5ff' }} />
                                </div>
                                <div className="px-4 py-3 rounded-2xl rounded-bl-sm"
                                    style={{ background: 'rgba(143,245,255,0.06)', border: '1px solid rgba(143,245,255,0.1)' }}>
                                    <div className="flex gap-1">
                                        {[0, 1, 2].map(i => (
                                            <span key={i} className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-bounce"
                                                style={{ animationDelay: `${i * 150}ms`, color: '#8ff5ff' }} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        {error && (
                            <div className="text-[11px] text-destructive/80 bg-destructive/5 border border-destructive/20 px-3 py-2 rounded-xl">{error}</div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="border-t border-white/5 p-3 shrink-0">
                        <div className="flex gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit() } }}
                                placeholder="Reply…"
                                rows={2}
                                className="flex-1 bg-muted/20 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                                disabled={isSending}
                            />
                            <button
                                onClick={handleSubmit}
                                disabled={!input.trim() || isSending}
                                className="px-3 rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
                                style={{ background: 'rgba(143,245,255,0.15)', color: '#8ff5ff' }}
                                onMouseEnter={e => { if (!(e.currentTarget as HTMLButtonElement).disabled) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(143,245,255,0.25)' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(143,245,255,0.15)' }}
                            >
                                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </div>
                        <div className="flex items-center justify-between mt-1.5 px-1">
                            <BackboneSelector
                                backbones={backbones as any[]}
                                value={selectedBackboneId}
                                onChange={setSelectedBackboneId}
                                compact
                            />
                            <span className="text-[10px] text-muted-foreground/25">⌘↵ to send</span>
                        </div>
                    </div>
                    </div>{/* end messages + input */}

                    </div>{/* end chat area */}
                </>
            ) : (
                // ── Init state: command input ──────────────────────────────
                <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
                    <div className="w-full max-w-xl">
                        {/* Headline */}
                        <div className="text-center mb-8">
                            <p className="text-[10px] tracking-[0.3em] text-muted-foreground/40 uppercase font-bold mb-3">
                                Workspace Governance Interface
                            </p>
                            <h2 className="text-3xl font-bold text-foreground leading-tight">
                                How can I help you today?
                            </h2>
                        </div>

                        {/* Glass input */}
                        <div className="relative group mb-6">
                            <div className="absolute -inset-px rounded-3xl opacity-30 group-focus-within:opacity-70 transition-opacity pointer-events-none"
                                style={{ background: 'linear-gradient(135deg, rgba(143,245,255,0.3), rgba(255,81,250,0.3))', filter: 'blur(2px)' }} />
                            <div className="relative rounded-2xl bg-card/60 backdrop-blur-xl border border-white/8 overflow-hidden"
                                style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit() }
                                    }}
                                    placeholder="Issue a command, brief a department, or query the workspace…"
                                    className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-foreground placeholder:text-muted-foreground/30 text-base p-5 min-h-[120px] resize-none"
                                    disabled={isInitializing}
                                />
                                <div className="flex items-center justify-between px-5 pb-4 gap-3">
                                    <BackboneSelector
                                        backbones={backbones as any[]}
                                        value={selectedBackboneId}
                                        onChange={setSelectedBackboneId}
                                    />
                                    <button
                                        onClick={handleSubmit}
                                        disabled={!input.trim() || isInitializing}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold tracking-tight transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={{
                                            background: 'rgba(143,245,255,0.9)',
                                            color: '#005d63',
                                        }}
                                        onMouseEnter={e => { if (!(e.currentTarget as HTMLButtonElement).disabled) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 25px rgba(143,245,255,0.4)' }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '' }}
                                    >
                                        {isInitializing
                                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting…</>
                                            : <>Execute <Zap className="w-3.5 h-3.5" /></>
                                        }
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Quick action chips */}
                        <div className="flex flex-wrap justify-center gap-2.5">
                            <QuickChip
                                icon={<Play className="w-3.5 h-3.5" />}
                                label="Run Workspace Pilot"
                                color="cyan"
                                onClick={async () => {
                                    const cfg = await getPilotConfig(null)
                                    if (!cfg?.is_active) { toast.error('Enable Workspace Pilot in settings first'); return }
                                    const result = await runPilot(null)
                                    if (result.error) toast.error(`Pilot failed: ${result.error}`)
                                    else toast.success('Pilot cycle complete', { duration: 4000 })
                                }}
                            />
                            <QuickChip
                                icon={<Activity className="w-3.5 h-3.5" />}
                                label="Review yesterday's logs"
                                color="magenta"
                                onClick={onOpenTimeline}
                            />
                            <QuickChip
                                icon={<Plus className="w-3.5 h-3.5" />}
                                label="Deploy new department"
                                color="amber"
                                onClick={onNewPod}
                            />
                            <QuickChip
                                icon={<MessageCircle className="w-3.5 h-3.5" />}
                                label="Open Workspace Chat"
                                color="default"
                                onClick={async () => {
                                    setIsInitializing(true)
                                    const conv = await createConversation('Workspace Chat', undefined, undefined, undefined, selectedBackboneId)
                                    setIsInitializing(false)
                                    if (conv?.id) onConversationChange(conv.id)
                                    else toast.error(conv?.error || 'Failed to start chat')
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

interface DelegationCardData {
    pod_id: string
    pod_name?: string
    pod_slug?: string
    goal: string
    orchestration_id?: string
    status?: string
}

/** Extract top-level JSON objects from text using bracket counting */
function extractJsonObjects(text: string): DelegationCardData[] {
    const cards: DelegationCardData[] = []
    let i = 0
    while (i < text.length) {
        const start = text.indexOf('{', i)
        if (start === -1) break
        let depth = 0
        let j = start
        let inString = false
        let escape = false
        while (j < text.length) {
            const ch = text[j]
            if (escape) { escape = false; j++; continue }
            if (ch === '\\' && inString) { escape = true; j++; continue }
            if (ch === '"') inString = !inString
            if (!inString) {
                if (ch === '{') depth++
                else if (ch === '}') { depth--; if (depth === 0) break }
            }
            j++
        }
        if (depth === 0) {
            const chunk = text.slice(start, j + 1)
            try {
                const obj = JSON.parse(chunk)
                if (obj && typeof obj === 'object' && obj.pod_id && obj.goal) {
                    cards.push(obj as DelegationCardData)
                }
            } catch { /* not valid JSON */ }
            i = j + 1
        } else {
            i = start + 1
        }
    }
    return cards
}

function parseDelegationCards(content: string): DelegationCardData[] {
    // Try fenced code blocks first
    const cards: DelegationCardData[] = []
    const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/g
    let m
    const usedRanges: Array<[number, number]> = []
    while ((m = fenced.exec(content)) !== null) {
        const found = extractJsonObjects(m[1])
        found.forEach(c => cards.push(c))
        if (found.length > 0) usedRanges.push([m.index, m.index + m[0].length])
    }
    // Then scan remaining text for bare JSON objects
    let remaining = content
    for (const [start, end] of usedRanges.reverse()) {
        remaining = remaining.slice(0, start) + ' '.repeat(end - start) + remaining.slice(end)
    }
    const bareCards = extractJsonObjects(remaining)
    bareCards.forEach(c => cards.push(c))
    // Deduplicate by pod_id+goal
    const seen = new Set<string>()
    return cards.filter(c => {
        const key = `${c.pod_id}:${c.goal.slice(0, 60)}`
        if (seen.has(key)) return false
        seen.add(key); return true
    })
}

function stripDelegationJson(content: string): string {
    // Remove fenced blocks containing pod_id JSON
    let result = content.replace(/```(?:json)?\s*[\s\S]*?"pod_id"[\s\S]*?```/g, '')
    // Remove bare JSON objects with pod_id — use bracket counting to find them
    const toRemove: Array<[number, number]> = []
    let i = 0
    while (i < result.length) {
        const start = result.indexOf('{"pod_id"', i)
        if (start === -1) break
        let depth = 0
        let j = start
        let inStr = false
        let esc = false
        while (j < result.length) {
            const ch = result[j]
            if (esc) { esc = false; j++; continue }
            if (ch === '\\' && inStr) { esc = true; j++; continue }
            if (ch === '"') inStr = !inStr
            if (!inStr) {
                if (ch === '{') depth++
                else if (ch === '}') { depth--; if (depth === 0) break }
            }
            j++
        }
        if (depth === 0) { toRemove.push([start, j + 1]); i = j + 1 }
        else i = start + 1
    }
    for (const [s, e] of toRemove.reverse()) {
        result = result.slice(0, s) + result.slice(e)
    }
    return result.trim()
}

function ChatMessage({ message }: { message: Message }) {
    const isUser = message.role === 'user'
    const delegationCards = message.role === 'assistant' ? parseDelegationCards(message.content) : []
    let displayContent = delegationCards.length > 0 ? stripDelegationJson(message.content) : message.content
    // Also strip <tool_result> XML and "Orchestration created: UUID." lines from legacy messages
    displayContent = displayContent
        .replace(/<tool_result[^>]*>[\s\S]*?<\/tool_result>/g, '')
        .replace(/Orchestration created: [0-9a-f-]{36}\.?[^\n]*/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    const statusStyle: Record<string, { label: string; color: string }> = {
        pending_approval: { label: 'Pending', color: 'rgba(255,209,111,0.8)' },
        running: { label: 'Running', color: 'rgba(143,245,255,0.8)' },
        completed: { label: 'Done', color: 'rgba(100,255,160,0.8)' },
        failed: { label: 'Failed', color: 'rgba(255,100,100,0.8)' },
    }

    return (
        <div className={cn('flex gap-3 items-end', isUser ? 'justify-end' : '')}>
            {!isUser && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(143,245,255,0.15)' }}>
                    <Bot className="w-3.5 h-3.5" style={{ color: '#8ff5ff' }} />
                </div>
            )}
            <div className={cn('flex flex-col gap-2', isUser ? 'items-end max-w-[80%]' : 'flex-1 max-w-[90%]')}>
                {(displayContent || !delegationCards.length) && (
                    <div
                        className={cn(
                            'px-4 py-3 rounded-2xl text-sm leading-relaxed',
                            isUser
                                ? 'rounded-br-sm bg-primary text-primary-foreground'
                                : 'rounded-bl-sm w-full'
                        )}
                        style={!isUser ? {
                            background: 'rgba(143,245,255,0.06)',
                            border: '1px solid rgba(143,245,255,0.1)',
                        } : {}}
                    >
                        {message.role === 'assistant' ? (
                            <div
                                className="prose-chat text-[13px] [&_strong]:font-semibold [&_p]:mb-1 [&_ul]:mb-1 [&_li]:text-[13px]"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(displayContent) }}
                            />
                        ) : (
                            <p className="text-[13px] whitespace-pre-wrap">{message.content}</p>
                        )}
                    </div>
                )}

                {/* Delegation cards */}
                {delegationCards.length > 0 && (
                    <div className="w-full space-y-1.5">
                        <div className="flex items-center gap-1.5 px-1">
                            <Activity className="w-3 h-3" style={{ color: '#8ff5ff', opacity: 0.7 }} />
                            <span className="text-[10px] font-semibold" style={{ color: 'rgba(143,245,255,0.6)' }}>
                                {delegationCards.length} pod{delegationCards.length !== 1 ? 's' : ''} delegated
                            </span>
                        </div>
                        {delegationCards.map((card, ci) => {
                            const ss = card.status ? statusStyle[card.status] : null
                            return (
                                <div key={ci} className="flex items-start gap-2 px-3 py-2 rounded-xl"
                                    style={{ background: 'rgba(143,245,255,0.05)', border: '1px solid rgba(143,245,255,0.12)' }}>
                                    <Layers className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#8ff5ff', opacity: 0.7 }} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-medium leading-snug line-clamp-2" style={{ color: 'rgba(255,255,255,0.85)' }}>
                                            {card.goal}
                                        </div>
                                        {(card.pod_name || card.pod_slug) && (
                                            <div className="text-[10px] mt-0.5" style={{ color: 'rgba(143,245,255,0.5)' }}>
                                                {card.pod_name || card.pod_slug}
                                            </div>
                                        )}
                                    </div>
                                    {ss && (
                                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                                            style={{ color: ss.color, background: `${ss.color}18`, border: `1px solid ${ss.color}30` }}>
                                            {ss.label}
                                        </span>
                                    )}
                                    {card.pod_slug && (
                                        <a href={`/dashboard/pods/${card.pod_slug}?tab=goals`}
                                            className="text-[9px] shrink-0 hover:underline"
                                            style={{ color: 'rgba(143,245,255,0.6)' }}>
                                            View
                                        </a>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

function QuickChip({
    icon, label, color, onClick,
}: {
    icon: React.ReactNode
    label: string
    color: 'cyan' | 'magenta' | 'amber' | 'default'
    onClick: () => void
}) {
    const hoverClasses = {
        cyan: 'hover:border-[rgba(143,245,255,0.3)] hover:text-[#8ff5ff]',
        magenta: 'hover:border-[rgba(255,81,250,0.3)] hover:text-[#ff51fa]',
        amber: 'hover:border-[rgba(255,209,111,0.3)] hover:text-[#ffd16f]',
        default: 'hover:border-white/20 hover:text-foreground',
    }
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full border border-white/8 bg-white/[0.02] text-muted-foreground/60 text-xs font-medium transition-all',
                hoverClasses[color]
            )}
        >
            {icon}
            {label}
        </button>
    )
}

// ── Backbone Selector ──────────────────────────────────────────────────────

type BackboneConnection = {
    id: string
    name: string
    backbone_type: string
    is_default: boolean
    is_active: boolean
    health_status: string | null
}

function BackboneSelector({
    backbones,
    value,
    onChange,
    compact = false,
}: {
    backbones: BackboneConnection[]
    value: string | null
    onChange: (id: string | null) => void
    compact?: boolean
}) {
    const active = backbones.filter(b => b.is_active)
    const selected = active.find(b => b.id === value) ?? active[0] ?? null

    const healthDot = (status: string | null) => {
        if (status === 'healthy') return 'bg-emerald-400'
        if (status === 'unhealthy') return 'bg-red-400'
        return 'bg-yellow-400'
    }

    if (!selected) return null

    return (
        <Select value={value ?? ''} onValueChange={(v) => onChange(v || null)}>
            <SelectTrigger
                className={cn(
                    'border-none bg-transparent shadow-none text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0 h-auto gap-1.5 focus:ring-0',
                    compact ? 'text-[10px]' : 'text-[11px]'
                )}
            >
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', healthDot(selected.health_status))} />
                <SelectValue>
                    <span className="truncate max-w-[120px]">{selected.name}</span>
                </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
                {active.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                        <div className="flex items-center gap-2">
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', healthDot(b.health_status))} />
                            <span>{b.name}</span>
                            {b.is_default && (
                                <span className="ml-1 text-[9px] text-muted-foreground/40 uppercase tracking-wide">default</span>
                            )}
                        </div>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

// ── Session Detail View (replaces timeline when a log entry is clicked) ────

interface SessionDetailViewProps {
    detail: SessionDetail
    onBack: () => void
    onOpenConversation: (convId: string | null) => void
}

function SessionDetailView({ detail, onBack, onOpenConversation }: SessionDetailViewProps) {
    const { log } = detail
    const meta = log.metadata as any
    const actions: any[] = meta?.actions ?? meta?.steps ?? meta?.tool_calls ?? []

    const pipColor = {
        success: '#22c55e',
        error: 'rgb(var(--destructive))',
        running: '#8ff5ff',
        skipped: 'rgba(255,255,255,0.2)',
        dry_run: '#ffd16f',
        timeout: '#ffd16f',
    }[log.status] ?? 'rgba(255,255,255,0.2)'

    return (
        <div className="h-full flex flex-col bg-background/60 backdrop-blur-sm">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                <button
                    onClick={onBack}
                    className="p-1 rounded-lg hover:bg-accent text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    title="Back to timeline"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <div className="flex-1 min-w-0">
                    <h2 className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/60 uppercase truncate">Session Detail</h2>
                </div>
                <StatusBadge status={log.status} />
            </div>

            {/* Session summary */}
            <div className="px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-0.5 h-8 rounded-full shrink-0" style={{ background: pipColor }} />
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                            {log.trigger_type === 'coordinator' ? 'Pilot Run'
                                : log.trigger_type === 'workspace_chat' ? 'Workspace Chat'
                                : log.trigger_type}
                        </p>
                        <p className="text-[11px] text-muted-foreground/80">
                            {formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}
                            {log.duration_ms != null && (
                                <> · {log.duration_ms < 1000 ? `${log.duration_ms}ms` : `${(log.duration_ms / 1000).toFixed(1)}s`}</>
                            )}
                        </p>
                    </div>
                    {meta?.actions_taken != null && (
                        <span className="ml-auto text-[9px] bg-accent/50 px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                            {meta.actions_taken} actions
                        </span>
                    )}
                </div>
                {log.summary && (
                    <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-3">{log.summary}</p>
                )}
            </div>

            {/* Event chain */}
            <div className="flex-1 overflow-y-auto custom-cockpit-scroll px-3 py-3">
                {actions.length > 0 ? (
                    <div className="space-y-0">
                        <p className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase mb-2 px-1">Event Chain</p>
                        {actions.map((action: any, idx: number) => (
                            <SessionEventCard key={idx} action={action} index={idx} isLast={idx === actions.length - 1} />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Activity className="w-7 h-7 text-muted-foreground/20 mb-2" />
                        <p className="text-[11px] text-muted-foreground/40">No event chain available</p>
                        <p className="text-[10px] text-muted-foreground/25 mt-1">Open the conversation to see full details</p>
                    </div>
                )}
            </div>

            {/* Footer CTA */}
            <div className="border-t border-white/5 p-3">
                <button
                    onClick={() => onOpenConversation(log.conversation_id ?? null)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold transition-all"
                    style={{
                        background: 'rgba(143,245,255,0.1)',
                        color: '#8ff5ff',
                        border: '1px solid rgba(143,245,255,0.15)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(143,245,255,0.18)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(143,245,255,0.1)' }}
                >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {log.conversation_id ? 'Continue session' : 'Open Workspace Chat'}
                </button>
            </div>
        </div>
    )
}

function SessionEventCard({ action, index, isLast }: { action: any; index: number; isLast: boolean }) {
    const [expanded, setExpanded] = useState(false)

    const hasTaskId = !!action.task_id
    const actionType = action.type ?? action.action_type ?? action.tool ?? 'action'
    const summary = action.summary ?? action.description ?? action.result ?? action.output ?? ''
    const status = action.status ?? 'completed'

    const dotColorMap: Record<string, string> = {
        completed: '#22c55e',
        success: '#22c55e',
        failed: 'rgb(var(--destructive))',
        error: 'rgb(var(--destructive))',
        running: '#8ff5ff',
        skipped: 'rgba(255,255,255,0.2)',
    }
    const dotColor = dotColorMap[status] ?? '#8ff5ff'

    return (
        <div className="flex gap-0">
            {/* Timeline connector */}
            <div className="flex flex-col items-center w-6 shrink-0 pt-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor, boxShadow: `0 0 5px ${dotColor}80` }} />
                {!isLast && <div className="w-px flex-1 mt-1" style={{ background: 'rgba(255,255,255,0.06)' }} />}
            </div>

            {/* Card */}
            <div className="flex-1 min-w-0 pb-3">
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-muted/10 transition-colors group"
                >
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-bold tracking-wider text-muted-foreground/50 uppercase">{index + 1}.</span>
                        <span className="text-[10px] font-semibold text-foreground/80 truncate">{actionType}</span>
                        {hasTaskId && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(143,245,255,0.08)] text-[#8ff5ff] font-medium shrink-0">
                                task
                            </span>
                        )}
                        <span className="ml-auto text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0">
                            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </span>
                    </div>
                </button>

                {expanded && (
                    <div className="mt-1 px-2.5 space-y-2">
                        {summary && (
                            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{summary}</p>
                        )}
                        {hasTaskId && (
                            <div
                                className="flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors"
                                style={{ background: 'rgba(143,245,255,0.05)', border: '1px solid rgba(143,245,255,0.1)' }}
                                onClick={() => {
                                    // Navigate to task — future enhancement
                                    toast.info(`Task ID: ${action.task_id}`)
                                }}
                            >
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#8ff5ff' }} />
                                <span className="text-[10px] font-medium" style={{ color: '#8ff5ff' }}>
                                    {action.task_title ?? `Task ${action.task_id.slice(0, 8)}…`}
                                </span>
                                <ChevronRight className="w-3 h-3 ml-auto" style={{ color: '#8ff5ff' }} />
                            </div>
                        )}
                        {action.metadata && (
                            <pre className="text-[9px] text-muted-foreground/40 bg-muted/20 rounded p-2 overflow-auto max-h-24">
                                {JSON.stringify(action.metadata, null, 2)}
                            </pre>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Workspace Timeline ─────────────────────────────────────────────────────

interface WorkspaceTimelineProps {
    onSelectLog: (log: ExecutionLog) => void
}

function WorkspaceTimeline({ onSelectLog }: WorkspaceTimelineProps) {
    const [logs, setLogs] = useState<ExecutionLog[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedLog, setExpandedLog] = useState<string | null>(null)
    const [refreshing, setRefreshing] = useState(false)

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true)
        else setRefreshing(true)
        try {
            // Load all trigger types: coordinator cycles + workspace chat sessions
            const data = await getExecutionLog()
            setLogs((data || []).slice(0, 20))
        } catch {
            setLogs([])
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    // Auto-refresh every 30s
    useEffect(() => {
        const t = setInterval(() => load(true), 30000)
        return () => clearInterval(t)
    }, [load])

    // Group logs by day
    const grouped = groupByDay(logs)

    return (
        <div className="h-full flex flex-col bg-background/60 backdrop-blur-sm">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                <div className="flex-1">
                    <h2 className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/60 uppercase">24h Company Timeline</h2>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-bold tracking-widest text-emerald-500/80 uppercase">Live</span>
                </div>
                <button
                    onClick={() => load(true)}
                    disabled={refreshing}
                    className="p-1 rounded-lg hover:bg-accent text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                    <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} />
                </button>
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto custom-cockpit-scroll">
                {loading ? (
                    <div className="flex flex-col gap-3 p-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-16 rounded-xl bg-muted/20 animate-pulse" />
                        ))}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                        <Activity className="w-8 h-8 text-muted-foreground/20 mb-3" />
                        <p className="text-xs text-muted-foreground/40">No activity yet</p>
                        <p className="text-[10px] text-muted-foreground/25 mt-1">Pilot runs will appear here</p>
                    </div>
                ) : (
                    <div className="p-3 space-y-1">
                        {grouped.map(({ label, entries }) => (
                            <div key={label}>
                                {/* Day divider */}
                                <div className="flex items-center gap-2 py-2 px-1">
                                    <span className="text-[9px] tracking-[0.25em] text-muted-foreground/30 uppercase font-bold">{label}</span>
                                    <div className="flex-1 h-px bg-white/5" />
                                </div>
                                {entries.map(log => (
                                    <TimelineEntry
                                        key={log.id}
                                        log={log}
                                        isExpanded={expandedLog === log.id}
                                        onToggleExpand={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                                        onSelect={() => onSelectLog(log)}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer metrics */}
            {logs.length > 0 && <TimelineFooter logs={logs} />}
        </div>
    )
}

function TimelineEntry({
    log,
    isExpanded,
    onToggleExpand,
    onSelect,
}: {
    log: ExecutionLog
    isExpanded: boolean
    onToggleExpand: () => void
    onSelect: () => void
}) {
    const meta = log.metadata as any
    const pipColor = {
        success: '#22c55e',
        error: 'rgb(var(--destructive))',
        running: '#8ff5ff',
        skipped: 'rgba(255,255,255,0.2)',
        dry_run: '#ffd16f',
        timeout: '#ffd16f',
    }[log.status] ?? 'rgba(255,255,255,0.2)'

    const typeLabel = log.trigger_type === 'coordinator' ? 'PILOT'
        : log.trigger_type === 'workspace_chat' ? 'CHAT'
        : log.trigger_type.toUpperCase()

    return (
        <div className="mb-1 rounded-xl bg-muted/10 hover:bg-muted/20 border border-white/5 transition-colors overflow-hidden cursor-pointer"
            onClick={onSelect}
        >
            <div className="flex items-start gap-0">
                {/* Colored left border pip */}
                <div className="w-0.5 self-stretch shrink-0 rounded-l-xl" style={{ background: pipColor }} />

                <div className="flex-1 min-w-0 p-3">
                    {/* Top row: type + status + time */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-bold tracking-widest text-muted-foreground/50 uppercase">
                            {typeLabel}
                        </span>
                        <StatusBadge status={log.status} />
                        {meta?.actions_taken != null && (
                            <span className="text-[9px] bg-accent/50 px-1.5 py-0.5 rounded text-muted-foreground">
                                {meta.actions_taken} actions
                            </span>
                        )}
                        <span className="text-[9px] text-muted-foreground/40 ml-auto shrink-0">
                            {formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}
                            {log.duration_ms != null && (
                                <> · {log.duration_ms < 1000 ? `${log.duration_ms}ms` : `${(log.duration_ms / 1000).toFixed(1)}s`}</>
                            )}
                        </span>
                    </div>

                    {/* Summary */}
                    {log.summary && (
                        <div className="mt-1.5">
                            <div
                                className={cn(
                                    'prose-chat text-[11px] leading-relaxed [&_strong]:font-semibold [&_p]:mb-0.5 [&_ul]:mb-0.5 [&_li]:text-[11px] overflow-hidden transition-all',
                                    isExpanded ? 'max-h-[200px] overflow-y-auto pr-1' : 'max-h-[2.5rem]',
                                )}
                                style={{ color: 'rgba(var(--muted-foreground), 0.8)' }}
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(log.summary) }}
                                onClick={e => { e.stopPropagation(); onToggleExpand() }}
                            />
                            <button
                                onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
                                className="text-[9px] text-primary/60 hover:text-primary mt-0.5 transition-colors"
                            >
                                {isExpanded ? 'Show less' : 'Show more'}
                            </button>
                        </div>
                    )}

                    {/* View session link */}
                    <div className="mt-2 flex items-center gap-1 text-[10px]" style={{ color: '#8ff5ff' }}>
                        <MessageCircle className="w-3 h-3" />
                        <span className="font-medium">{log.conversation_id ? 'View session' : 'Open chat'}</span>
                        <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
                    </div>
                </div>
            </div>
        </div>
    )
}

function TimelineFooter({ logs }: { logs: ExecutionLog[] }) {
    const total = logs.length
    const succeeded = logs.filter(l => l.status === 'success').length
    const efficiency = total > 0 ? Math.round((succeeded / total) * 100) : null

    return (
        <div className="border-t border-white/5 px-4 py-3 flex items-center gap-3">
            <div className="flex-1">
                <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest font-bold">Efficiency</p>
                <p className="text-lg font-bold leading-tight" style={{ color: '#8ff5ff' }}>
                    {efficiency != null ? `${efficiency}%` : '--'}
                </p>
            </div>
            <div className="w-px h-8 bg-white/5" />
            <div className="flex-1">
                <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest font-bold">Runs</p>
                <p className="text-lg font-bold leading-tight text-foreground">{total}</p>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground/20 ml-auto">
                <span className="w-1 h-1 rounded-full bg-emerald-500/50" />
                <span className="uppercase tracking-widest font-bold">Secure</span>
            </div>
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        success: 'bg-green-500/15 text-green-400',
        error: 'bg-destructive/15 text-destructive',
        running: 'bg-[rgba(143,245,255,0.1)] text-[#8ff5ff]',
        skipped: 'bg-muted text-muted-foreground',
        dry_run: 'bg-amber-500/15 text-amber-400',
        timeout: 'bg-amber-500/15 text-amber-400',
    }
    return (
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider', styles[status] || 'bg-muted text-muted-foreground')}>
            {status}
        </span>
    )
}

// ── Utilities ──────────────────────────────────────────────────────────────

function groupByDay(logs: ExecutionLog[]): Array<{ label: string; entries: ExecutionLog[] }> {
    const map = new Map<string, ExecutionLog[]>()
    for (const log of logs) {
        const d = new Date(log.started_at)
        const key = isToday(d) ? 'TODAY' : isYesterday(d) ? 'YESTERDAY' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(log)
    }
    return Array.from(map.entries()).map(([label, entries]) => ({ label, entries }))
}
