'use client'

import { useCallback, useMemo, useState, useEffect } from 'react'
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    type Connection,
    BackgroundVariant,
    Panel,
    MarkerType,
    Handle,
    Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useRouter } from 'next/navigation'
import { MessageCircle, Settings, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BoardIcon } from '@/lib/board-icon'
import { BoardAIChat } from '@/components/boards/board-ai-chat'
import { useRemoveFromPod } from '@/hooks/use-pods'
import { toast } from 'sonner'
import type { Board } from '@/types/board'
import { RouteEditorSheet } from '@/components/pods/route-editor-sheet'
import { getPodRoutesFiltered } from '@/app/dashboard/pods/actions'
import type { BoardRoute } from '@/types/pod'

// ── Board Node ──────────────────────────────────────────────────────────────

interface BoardNodeData {
    board: Board
    podSlug: string
    onRemove: (boardId: string, boardName: string) => void
    onOpenChat: (boardId: string, boardName: string) => void
    [key: string]: unknown
}

function BoardNode({ data }: { data: BoardNodeData }) {
    const router = useRouter()
    const { board, onRemove, onOpenChat } = data
    const color = board.color || '#6366f1'

    const stepCount = board.board_steps?.length ?? 0
    const taskCount = board.task_count ?? 0

    return (
        <>
            {/* ReactFlow connection handles */}
            <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-border !border-border" />
            <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-border !border-border" />

            <div
                className="bg-card border rounded-xl shadow-sm w-[220px] overflow-hidden group"
                style={{ borderColor: `${color}40`, borderWidth: '1.5px' }}
            >
                {/* Color strip */}
                <div className="h-1 w-full" style={{ backgroundColor: color }} />

                {/* Header */}
                <div className="flex items-center gap-2 p-3 pb-2">
                    <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ backgroundColor: `${color}20` }}
                    >
                        <BoardIcon name={board.icon} className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-tight truncate">{board.name}</p>
                        {board.description && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{board.description}</p>
                        )}
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove(board.id, board.name) }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 hover:text-destructive shrink-0"
                        title="Remove from pod"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Step pills */}
                {board.board_steps && board.board_steps.length > 0 && (
                    <div className="flex gap-1 flex-wrap px-3 pb-2">
                        {board.board_steps.slice(0, 3).map((step) => (
                            <span
                                key={step.id}
                                className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                                style={{
                                    backgroundColor: `${step.color || color}20`,
                                    color: step.color || color,
                                }}
                            >
                                {step.name}
                            </span>
                        ))}
                        {board.board_steps.length > 3 && (
                            <span className="text-[9px] text-muted-foreground self-center">
                                +{board.board_steps.length - 3}
                            </span>
                        )}
                    </div>
                )}

                {/* Stats row */}
                <div className="flex items-center gap-3 px-3 pb-2 text-[10px] text-muted-foreground">
                    {stepCount > 0 && <span>{stepCount} step{stepCount !== 1 ? 's' : ''}</span>}
                    {taskCount > 0 && <span className="font-medium" style={{ color }}>{taskCount} task{taskCount !== 1 ? 's' : ''}</span>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 px-2 pb-2 border-t pt-2 mt-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] flex-1"
                        onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/boards/${board.id}`) }}
                    >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Open
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] flex-1"
                        onClick={(e) => { e.stopPropagation(); onOpenChat(board.id, board.name) }}
                    >
                        <MessageCircle className="w-3 h-3 mr-1" />
                        Chat
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px]"
                        onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/boards/${board.id}/settings`) }}
                    >
                        <Settings className="w-3 h-3" />
                    </Button>
                </div>
            </div>
        </>
    )
}

const nodeTypes = { boardNode: BoardNode }

// ── Route edge colors + markers by trigger type ────────────────────────────

function routeEdgeProps(trigger: string): { stroke: string; animated: boolean; dashArray?: string } {
    switch (trigger) {
        case 'auto':
            return { stroke: '#22c55e', animated: true }
        case 'ai_decision':
            return { stroke: '#a855f7', animated: true }
        case 'error':
            return { stroke: '#ef4444', animated: false, dashArray: '6 3' }
        case 'fallback':
            return { stroke: '#f97316', animated: false, dashArray: '4 4' }
        case 'manual':
        default:
            return { stroke: '#94a3b8', animated: false }
    }
}

function buildRouteEdge(route: BoardRoute): Edge {
    const { stroke, animated, dashArray } = routeEdgeProps(route.trigger)
    return {
        id: `route-${route.id}`,
        source: route.source_board_id,
        target: route.target_board_id,
        type: 'smoothstep',
        animated,
        label: route.label || route.trigger,
        labelStyle: { fontSize: 10, fill: stroke, fontWeight: 600 },
        labelBgStyle: { fill: 'hsl(var(--card))', fillOpacity: 0.85 },
        style: {
            strokeWidth: 2,
            stroke,
            ...(dashArray ? { strokeDasharray: dashArray } : {}),
        },
        markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: stroke,
        },
        data: { route },
    }
}

// ── Canvas ─────────────────────────────────────────────────────────────────

interface PodBoardCanvasProps {
    boards: Board[]
    podSlug: string
    podId?: string
    onAddBoards: () => void
    onOpenChat?: () => void
}

function buildInitialNodes(
    boards: Board[],
    podSlug: string,
    onRemove: (id: string, name: string) => void,
    onOpenChat: (id: string, name: string) => void,
): Node[] {
    return boards.map((board, i) => {
        const col = i % 3
        const row = Math.floor(i / 3)
        return {
            id: board.id,
            type: 'boardNode',
            position: { x: col * 280 + (row % 2 === 0 ? 0 : 20), y: row * 230 },
            data: { board, podSlug, onRemove, onOpenChat } as BoardNodeData,
        }
    })
}

export function PodBoardCanvas({ boards, podSlug, podId, onAddBoards, onOpenChat }: PodBoardCanvasProps) {
    const removeFromPod = useRemoveFromPod()
    const [chatBoard, setChatBoard] = useState<{ id: string; name: string } | null>(null)
    const [routes, setRoutes] = useState<BoardRoute[]>([])

    // Route editor state
    const [routeSheetOpen, setRouteSheetOpen] = useState(false)
    const [pendingConnection, setPendingConnection] = useState<Connection | null>(null)
    const [editingRoute, setEditingRoute] = useState<BoardRoute | null>(null)

    // Load existing routes
    useEffect(() => {
        if (podId) {
            getPodRoutesFiltered(podId)
                .then(setRoutes)
                .catch(() => setRoutes([]))
        }
    }, [podId])

    const handleRemove = useCallback(
        async (boardId: string, boardName: string) => {
            const res = await removeFromPod.mutateAsync(boardId)
            if (res.success) toast.success(`Removed "${boardName}" from pod`)
            else toast.error(res.error || 'Failed to remove board')
        },
        [removeFromPod],
    )

    const handleOpenBoardChat = useCallback((boardId: string, boardName: string) => {
        setChatBoard({ id: boardId, name: boardName })
    }, [])

    const initialNodes = useMemo(
        () => buildInitialNodes(boards, podSlug, handleRemove, handleOpenBoardChat),
        [boards, podSlug, handleRemove, handleOpenBoardChat],
    )

    const routeEdges = useMemo(() => routes.map(buildRouteEdge), [routes])

    const [nodes, , onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(routeEdges)

    // Sync route edges when routes change
    useEffect(() => {
        setEdges(routes.map(buildRouteEdge))
    }, [routes, setEdges])

    const onConnect = useCallback(
        (params: Connection) => {
            // Open the route editor sheet instead of immediately creating an edge
            setPendingConnection(params)
            setEditingRoute(null)
            setRouteSheetOpen(true)
        },
        [],
    )

    const onEdgeClick = useCallback(
        (_: React.MouseEvent, edge: Edge) => {
            if (edge.data?.route) {
                setEditingRoute(edge.data.route as BoardRoute)
                setPendingConnection(null)
                setRouteSheetOpen(true)
            }
        },
        [],
    )

    const handleRouteSaved = useCallback((route: BoardRoute) => {
        setRoutes((prev) => {
            const exists = prev.find((r) => r.id === route.id)
            if (exists) return prev.map((r) => (r.id === route.id ? route : r))
            return [...prev, route]
        })
        setRouteSheetOpen(false)
        setPendingConnection(null)
        setEditingRoute(null)
    }, [])

    const handleRouteDeleted = useCallback((routeId: string) => {
        setRoutes((prev) => prev.filter((r) => r.id !== routeId))
        setRouteSheetOpen(false)
        setEditingRoute(null)
    }, [])

    const sourceBoardId = pendingConnection?.source ?? editingRoute?.source_board_id ?? null
    const targetBoardId = pendingConnection?.target ?? editingRoute?.target_board_id ?? null
    const sourceBoard = boards.find((b) => b.id === sourceBoardId) ?? null
    const targetBoard = boards.find((b) => b.id === targetBoardId) ?? null

    if (boards.length === 0) return null

    return (
        <>
            <div className="w-full h-full rounded-xl overflow-hidden border bg-background/50">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onEdgeClick={onEdgeClick}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.3 }}
                    proOptions={{ hideAttribution: true }}
                    defaultEdgeOptions={{
                        markerEnd: { type: MarkerType.ArrowClosed },
                    }}
                >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-30" />
                    <Controls className="!shadow-none !border !border-border rounded-lg overflow-hidden" />
                    <MiniMap
                        nodeColor={(n) => {
                            const board = boards.find((b) => b.id === n.id)
                            return board?.color || '#6366f1'
                        }}
                        className="!border !border-border rounded-lg overflow-hidden !bg-card"
                        maskColor="hsl(var(--background) / 0.7)"
                    />
                    <Panel position="top-right" className="flex gap-2">
                        {onOpenChat && (
                            <Button size="sm" variant="outline" onClick={onOpenChat} className="shadow-sm text-xs">
                                <MessageCircle className="w-3 h-3 mr-1" />
                                Pod Chat
                            </Button>
                        )}
                        <Button size="sm" onClick={onAddBoards} className="shadow-sm text-xs">
                            + Add board
                        </Button>
                    </Panel>

                    {/* Route legend */}
                    {routes.length > 0 && (
                        <Panel position="bottom-left" className="bg-card/80 border border-border rounded-lg p-2 text-[10px] space-y-1 backdrop-blur-sm">
                            <p className="font-semibold text-muted-foreground mb-1">Route types</p>
                            {[
                                { trigger: 'auto', label: 'Auto (on completion)' },
                                { trigger: 'manual', label: 'Manual (Send to Board)' },
                                { trigger: 'ai_decision', label: 'AI Decision' },
                                { trigger: 'error', label: 'Error / Fallback' },
                            ].map(({ trigger, label }) => {
                                const { stroke, dashArray, animated } = routeEdgeProps(trigger)
                                if (!routes.some((r) => r.trigger === trigger || (trigger === 'error' && (r.trigger === 'error' || r.trigger === 'fallback')))) return null
                                return (
                                    <div key={trigger} className="flex items-center gap-1.5">
                                        <svg width="20" height="8">
                                            <line
                                                x1="0" y1="4" x2="16" y2="4"
                                                stroke={stroke}
                                                strokeWidth="2"
                                                strokeDasharray={dashArray}
                                            />
                                            <polygon points="14,1 20,4 14,7" fill={stroke} />
                                        </svg>
                                        <span style={{ color: stroke }}>{label}</span>
                                    </div>
                                )
                            })}
                        </Panel>
                    )}
                </ReactFlow>
            </div>

            {/* Per-board chat drawer — opened from board nodes */}
            <BoardAIChat
                boardId={chatBoard?.id}
                boardName={chatBoard?.name}
                open={!!chatBoard}
                onOpenChange={(open) => { if (!open) setChatBoard(null) }}
            />

            {/* Route editor sheet */}
            {routeSheetOpen && (
                <RouteEditorSheet
                    open={routeSheetOpen}
                    onOpenChange={(open) => {
                        if (!open) {
                            setRouteSheetOpen(false)
                            setPendingConnection(null)
                            setEditingRoute(null)
                        }
                    }}
                    sourceBoard={sourceBoard}
                    targetBoard={targetBoard}
                    podId={podId}
                    existingRoute={editingRoute}
                    onSaved={handleRouteSaved}
                    onDeleted={handleRouteDeleted}
                />
            )}
        </>
    )
}
