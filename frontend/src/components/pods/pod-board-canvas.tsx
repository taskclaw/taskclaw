'use client'

import { useCallback, useMemo } from 'react'
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    addEdge,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    type Connection,
    BackgroundVariant,
    Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useRouter } from 'next/navigation'
import { MessageCircle, Settings, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRemoveFromPod } from '@/hooks/use-pods'
import { toast } from 'sonner'
import type { Board } from '@/types/board'

// ── Board Node ──────────────────────────────────────────────────────────────

interface BoardNodeData {
    board: Board
    podSlug: string
    onRemove: (boardId: string, boardName: string) => void
    [key: string]: unknown
}

function BoardNode({ data }: { data: BoardNodeData }) {
    const router = useRouter()
    const { board, podSlug, onRemove } = data
    const color = board.color || '#6366f1'

    const stepCount = board.board_steps?.length ?? 0
    const taskCount = board.task_count ?? 0

    return (
        <div
            className="bg-card border rounded-xl shadow-sm min-w-[200px] overflow-hidden group"
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
                    {board.icon || '📋'}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{board.name}</p>
                    {board.description && (
                        <p className="text-[10px] text-muted-foreground truncate">{board.description}</p>
                    )}
                </div>
                {/* Remove from pod */}
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemove(board.id, board.name)
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
                    title="Remove from pod"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 px-3 pb-2 text-[10px] text-muted-foreground">
                {stepCount > 0 && <span>{stepCount} step{stepCount !== 1 ? 's' : ''}</span>}
                {taskCount > 0 && <span>{taskCount} task{taskCount !== 1 ? 's' : ''}</span>}
                {board.board_steps && board.board_steps.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                        {board.board_steps.slice(0, 4).map((step) => (
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
                        {board.board_steps.length > 4 && (
                            <span className="text-[9px] text-muted-foreground">
                                +{board.board_steps.length - 4}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 px-2 pb-2 border-t pt-2 mt-1">
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] flex-1"
                    onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/dashboard/boards/${board.id}`)
                    }}
                >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] flex-1"
                    onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/dashboard/chat?board_id=${board.id}`)
                    }}
                >
                    <MessageCircle className="w-3 h-3 mr-1" />
                    Chat
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/dashboard/boards/${board.id}/settings`)
                    }}
                >
                    <Settings className="w-3 h-3" />
                </Button>
            </div>
        </div>
    )
}

const nodeTypes = { boardNode: BoardNode }

// ── Canvas ─────────────────────────────────────────────────────────────────

interface PodBoardCanvasProps {
    boards: Board[]
    podSlug: string
    onAddBoards: () => void
}

// Auto-layout: place boards in a staggered grid
function buildInitialNodes(boards: Board[], podSlug: string, onRemove: (id: string, name: string) => void): Node[] {
    return boards.map((board, i) => {
        const col = i % 3
        const row = Math.floor(i / 3)
        return {
            id: board.id,
            type: 'boardNode',
            position: { x: col * 280 + (row % 2 === 0 ? 0 : 20), y: row * 220 },
            data: { board, podSlug, onRemove } as BoardNodeData,
        }
    })
}

// Build edges: chain boards in order (can be customised later)
function buildInitialEdges(boards: Board[]): Edge[] {
    if (boards.length < 2) return []
    return boards.slice(0, -1).map((b, i) => ({
        id: `e-${b.id}-${boards[i + 1].id}`,
        source: b.id,
        target: boards[i + 1].id,
        type: 'smoothstep',
        animated: true,
        style: { strokeWidth: 1.5, strokeDasharray: '5 4', stroke: 'hsl(var(--muted-foreground))' },
    }))
}

export function PodBoardCanvas({ boards, podSlug, onAddBoards }: PodBoardCanvasProps) {
    const removeFromPod = useRemoveFromPod()

    const handleRemove = useCallback(
        async (boardId: string, boardName: string) => {
            const res = await removeFromPod.mutateAsync(boardId)
            if (res.success) {
                toast.success(`Removed "${boardName}" from pod`)
            } else {
                toast.error(res.error || 'Failed to remove board')
            }
        },
        [removeFromPod]
    )

    const initialNodes = useMemo(
        () => buildInitialNodes(boards, podSlug, handleRemove),
        [boards, podSlug, handleRemove]
    )
    const initialEdges = useMemo(() => buildInitialEdges(boards), [boards])

    const [nodes, , onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep' }, eds)),
        [setEdges]
    )

    if (boards.length === 0) return null

    return (
        <div className="w-full h-full rounded-xl overflow-hidden border bg-background/50">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                proOptions={{ hideAttribution: true }}
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
                <Panel position="top-right">
                    <Button size="sm" onClick={onAddBoards} className="shadow-sm text-xs">
                        + Add board
                    </Button>
                </Panel>
            </ReactFlow>
        </div>
    )
}
