'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePod, usePodBoards } from '@/hooks/use-pods'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Layers, Plus, MessageCircle, Settings, Loader2, LayoutGrid } from 'lucide-react'
import { PodBoardCanvas } from '@/components/pods/pod-board-canvas'
import { AssignBoardsDialog } from '@/components/pods/assign-boards-dialog'
import type { Board } from '@/types/board'

export default function PodCockpitPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params)
    const router = useRouter()
    const { data: pod, isLoading: podLoading } = usePod(slug)
    const { data: boards = [], isLoading: boardsLoading } = usePodBoards(pod?.id ?? null)
    const [assignOpen, setAssignOpen] = useState(false)

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
                        onClick={() => router.push(`/dashboard/pods/${slug}/chat`)}
                    >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        Pod Chat
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/dashboard/pods/${slug}/settings`)}
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
                    {pod.icon || <Layers className="w-5 h-5" />}
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

            {/* Canvas / Empty state — explicit height so ReactFlow renders correctly inside overflow-y-auto layout */}
            <div className="h-[calc(100dvh-16rem)] min-h-[400px] px-4 pb-4">
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
                        onAddBoards={() => setAssignOpen(true)}
                    />
                )}
            </div>

            {/* Assign boards dialog */}
            <AssignBoardsDialog
                open={assignOpen}
                onOpenChange={setAssignOpen}
                podId={pod.id}
                podName={pod.name}
                existingBoardIds={boardList.map((b) => b.id)}
            />
        </div>
    )
}
