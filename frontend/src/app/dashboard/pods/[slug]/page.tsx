'use client'

import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePod, usePodBoards } from '@/hooks/use-pods'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Layers,
    Plus,
    MessageCircle,
    Settings,
    Loader2,
    LayoutGrid,
    Target,
    ChevronDown,
    ChevronRight,
} from 'lucide-react'
import { PodBoardCanvas } from '@/components/pods/pod-board-canvas'
import { AssignBoardsDialog } from '@/components/pods/assign-boards-dialog'
import { BoardAIChat } from '@/components/boards/board-ai-chat'
import { PodPilotSheet } from '@/components/pods/pod-pilot-sheet'
import { DagApprovalBanner } from '@/components/dag/dag-approval-banner'
import type { Board } from '@/types/board'
import { getPodDags, type TaskDag } from '@/app/dashboard/pods/actions'

export default function PodCockpitPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params)
    const router = useRouter()
    const { data: pod, isLoading: podLoading } = usePod(slug)
    const { data: boards = [], isLoading: boardsLoading } = usePodBoards(pod?.id ?? null)
    const [assignOpen, setAssignOpen] = useState(false)
    const [chatOpen, setChatOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [dags, setDags] = useState<TaskDag[]>([])

    // Load DAGs for Goals tab
    useEffect(() => {
        if (pod?.id) {
            getPodDags(pod.id).then(setDags).catch(() => setDags([]))
        }
    }, [pod?.id])

    if (podLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        )
    }

    if (!pod) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <Layers className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Pod not found</h2>
                <p className="text-muted-foreground mb-4">This pod may have been deleted or the URL is incorrect.</p>
                <Button onClick={() => router.push('/dashboard/cockpit')}>Back to Cockpit</Button>
            </div>
        )
    }

    const color = pod.color || '#6366f1'
    const boardList = boards as Board[]

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center gap-2 px-4">
                <div className="flex items-center gap-2 flex-1">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink href="/dashboard/cockpit">Cockpit</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage>{pod.name}</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setChatOpen(true)}
                    >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        Pod Chat
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSettingsOpen(true)}
                    >
                        <Settings className="w-4 h-4 mr-1" />
                        Settings
                    </Button>
                </div>
            </header>

            {/* Pod banner */}
            <div className="flex items-center gap-3 pb-4 shrink-0 px-4">
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: `${color}20`, color }}
                >
                    {pod.icon && pod.icon.length <= 2 ? pod.icon : <Layers className="w-5 h-5" />}
                </div>
                <div>
                    <h1 className="text-lg font-bold">{pod.name}</h1>
                    {pod.description && (
                        <p className="text-sm text-muted-foreground">{pod.description}</p>
                    )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium bg-accent/50 px-2 py-0.5 rounded">
                        {boardList.length} board{boardList.length !== 1 ? 's' : ''}
                    </span>
                    {boardList.length > 0 && (
                        <Button size="sm" onClick={() => setAssignOpen(true)}>
                            <Plus className="w-4 h-4 mr-1" />
                            Add board
                        </Button>
                    )}
                </div>
            </div>

            {/* Canvas / Goals tabs */}
            <div className="flex-1 min-h-0 px-4 pb-4">
                <Tabs defaultValue="canvas" className="h-full flex flex-col">
                    <TabsList className="w-fit mb-3">
                        <TabsTrigger value="canvas" className="text-xs">
                            <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
                            Canvas
                        </TabsTrigger>
                        <TabsTrigger value="goals" className="text-xs">
                            <Target className="w-3.5 h-3.5 mr-1.5" />
                            Goals
                            {dags.filter((d) => d.status === 'pending_approval').length > 0 && (
                                <span className="ml-1.5 w-4 h-4 rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-[9px] font-bold flex items-center justify-center">
                                    {dags.filter((d) => d.status === 'pending_approval').length}
                                </span>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="canvas" className="flex-1 min-h-0 mt-0 h-[calc(100dvh-20rem)] min-h-[400px]">
                        {boardsLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : boardList.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <div className="w-14 h-14 rounded-2xl bg-accent/50 flex items-center justify-center mb-4">
                                    <LayoutGrid className="w-7 h-7 text-muted-foreground" />
                                </div>
                                <h3 className="text-sm font-semibold mb-1">No boards in this pod yet</h3>
                                <p className="text-xs text-muted-foreground max-w-xs mb-4">
                                    Assign existing boards or create new ones.
                                </p>
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={() => setAssignOpen(true)}>
                                        <Plus className="w-4 h-4 mr-1" />
                                        Add a board
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => router.push('/dashboard/boards?create=true')}
                                    >
                                        Create new board
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <PodBoardCanvas
                                boards={boardList}
                                podSlug={slug}
                                podId={pod.id}
                                onAddBoards={() => setAssignOpen(true)}
                                onOpenChat={() => setChatOpen(true)}
                            />
                        )}
                    </TabsContent>

                    <TabsContent value="goals" className="flex-1 min-h-0 mt-0 overflow-y-auto">
                        <GoalsTab
                            dags={dags}
                            onRefresh={() => pod?.id && getPodDags(pod.id).then(setDags).catch(() => {})}
                        />
                    </TabsContent>
                </Tabs>
            </div>

            {/* Assign boards dialog */}
            <AssignBoardsDialog
                open={assignOpen}
                onOpenChange={setAssignOpen}
                podId={pod.id}
                podName={pod.name}
                existingBoardIds={boardList.map((b) => b.id)}
            />

            {/* Pod AI Chat Drawer */}
            <BoardAIChat
                podId={pod.id}
                podName={pod.name}
                open={chatOpen}
                onOpenChange={setChatOpen}
            />

            {/* Pilot settings sheet */}
            <PodPilotSheet
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                podId={pod.id}
                podName={pod.name}
            />
        </div>
    )
}

// ── Goals Tab ──────────────────────────────────────────────────────────────

function GoalsTab({ dags, onRefresh }: { dags: TaskDag[]; onRefresh: () => void }) {
    const [expandedId, setExpandedId] = useState<string | null>(null)

    if (dags.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <Target className="w-10 h-10 text-muted-foreground/30" />
                <div>
                    <p className="font-medium text-sm">No goals yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Use the AI chat to decompose a goal into tasks.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {dags.map((dag) => (
                <div key={dag.id} className="border rounded-xl bg-card overflow-hidden">
                    {dag.status === 'pending_approval' && (
                        <DagApprovalBanner dag={dag} onAction={onRefresh} />
                    )}
                    <button
                        onClick={() => setExpandedId(expandedId === dag.id ? null : dag.id)}
                        className="w-full flex items-start gap-3 p-3 text-left hover:bg-accent/30 transition-colors"
                    >
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium leading-snug">{dag.goal}</span>
                                <DagStatusBadge status={dag.status} />
                            </div>
                            {dag.tasks && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {dag.tasks.length} task{dag.tasks.length !== 1 ? 's' : ''}
                                    {' · '}
                                    {dag.tasks.filter((t) => t.completed).length} completed
                                </p>
                            )}
                        </div>
                        {expandedId === dag.id ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                    </button>
                    {expandedId === dag.id && dag.tasks && dag.tasks.length > 0 && (
                        <div className="border-t px-3 pb-3 pt-2 space-y-1">
                            {dag.tasks.map((task) => (
                                <div
                                    key={task.id}
                                    className="flex items-center gap-2 text-xs py-1 border-b last:border-0"
                                >
                                    <div
                                        className={`w-2 h-2 rounded-full shrink-0 ${task.completed ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
                                    />
                                    <span className={task.completed ? 'line-through text-muted-foreground' : ''}>
                                        {task.title}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

function DagStatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; className: string }> = {
        pending_approval: {
            label: 'Pending approval',
            className: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
        },
        pending: { label: 'Pending', className: 'bg-slate-500/15 text-slate-700 dark:text-slate-400' },
        running: {
            label: 'Running',
            className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20',
        },
        completed: {
            label: 'Completed',
            className: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20',
        },
        failed: { label: 'Failed', className: 'bg-destructive/15 text-destructive' },
        cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
    }
    const s = map[status] || { label: status, className: '' }
    return (
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${s.className}`}>
            {s.label}
        </Badge>
    )
}
