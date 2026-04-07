'use client'

import type { TaskDAG, TaskDependency } from '@/types/pod'

interface DAGNode {
    id: string
    title: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'pending_approval'
    board_name?: string
}

interface DAGViewProps {
    dag: TaskDAG
    nodes: DAGNode[]
    dependencies: TaskDependency[]
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700 border-gray-200',
    pending_approval: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    running: 'bg-blue-100 text-blue-700 border-blue-200 animate-pulse',
    completed: 'bg-green-100 text-green-700 border-green-200',
    failed: 'bg-red-100 text-red-700 border-red-200',
}

export function DAGView({ dag, nodes, dependencies }: DAGViewProps) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                    Goal: <span className="text-foreground font-medium">{dag.goal}</span>
                </div>
                <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        STATUS_COLORS[dag.status] ?? STATUS_COLORS.pending
                    }`}
                >
                    {dag.status.replace('_', ' ')}
                </span>
            </div>

            <div className="flex flex-wrap gap-3">
                {nodes.map((node) => (
                    <div
                        key={node.id}
                        className={`rounded-lg border p-3 text-xs max-w-48 ${
                            STATUS_COLORS[node.status] ?? STATUS_COLORS.pending
                        }`}
                    >
                        <div className="font-medium">{node.title}</div>
                        {node.board_name && (
                            <div className="opacity-70 mt-1">{node.board_name}</div>
                        )}
                        <div className="mt-1 capitalize">{node.status.replace('_', ' ')}</div>
                    </div>
                ))}
            </div>

            {nodes.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                    No tasks in this DAG yet
                </div>
            )}

            {dependencies.length > 0 && (
                <div className="text-xs text-muted-foreground">
                    {dependencies.length} dependency relationship{dependencies.length !== 1 ? 's' : ''}
                </div>
            )}
        </div>
    )
}
