'use client'

import { LayoutGrid, Users, Activity, Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Pod } from '@/types/pod'
import type { Board } from '@/types/board'

interface AgentInfo {
  id: string
  name: string
  status?: string
  is_active?: boolean
  color?: string
}

interface PodContextSidebarProps {
  pod: Pod
  boards?: Board[]
  agents?: AgentInfo[]
  className?: string
}

const AGENT_STATUS_COLOR: Record<string, string> = {
  working: 'bg-cyan-400',
  idle: 'bg-muted-foreground/30',
  paused: 'bg-yellow-400',
  error: 'bg-destructive',
  offline: 'bg-muted-foreground/20',
}

export function PodContextSidebar({ pod, boards = [], agents = [], className }: PodContextSidebarProps) {
  const activeBoards = boards.filter((b) => !b.is_archived)
  const activeAgents = agents.filter((a) => a.is_active !== false)

  return (
    <div className={cn('flex flex-col gap-4 text-xs', className)}>
      {/* Pod info */}
      <div className="flex items-center gap-2 pb-3 border-b">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
          style={{ backgroundColor: `${pod.color || '#6366f1'}20`, color: pod.color || '#6366f1' }}
        >
          {pod.icon && pod.icon.length <= 2 ? pod.icon : <Layers className="w-4 h-4" />}
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">{pod.name}</p>
          {pod.description && (
            <p className="text-[11px] text-muted-foreground leading-tight line-clamp-2">{pod.description}</p>
          )}
        </div>
      </div>

      {/* Boards */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Boards</span>
          <span className="ml-auto text-[10px] text-muted-foreground/60">{activeBoards.length}</span>
        </div>
        {activeBoards.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/50 pl-5">No boards assigned</p>
        ) : (
          <div className="space-y-1">
            {activeBoards.map((board) => (
              <div key={board.id} className="flex items-center gap-2 pl-5">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: board.color || '#6366f1' }}
                />
                <span className="flex-1 truncate text-[11px]">{board.name}</span>
                {board.task_count != null && (
                  <span className="text-[10px] text-muted-foreground/50 shrink-0">
                    {board.task_count} tasks
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agents */}
      {agents.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Agents</span>
            <span className="ml-auto text-[10px] text-muted-foreground/60">{activeAgents.length} active</span>
          </div>
          <div className="space-y-1">
            {agents.slice(0, 5).map((agent) => (
              <div key={agent.id} className="flex items-center gap-2 pl-5">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    AGENT_STATUS_COLOR[agent.status || 'idle'] || 'bg-muted-foreground/30',
                  )}
                  title={agent.status}
                />
                <span className="flex-1 truncate text-[11px]">{agent.name}</span>
                {agent.status && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">
                    {agent.status}
                  </Badge>
                )}
              </div>
            ))}
            {agents.length > 5 && (
              <p className="text-[10px] text-muted-foreground/50 pl-5">+{agents.length - 5} more</p>
            )}
          </div>
        </div>
      )}

      {/* Autonomy level */}
      {pod.autonomy_level != null && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Autonomy</span>
          </div>
          <div className="pl-5">
            <Badge variant="outline" className="text-[10px]">
              Level {pod.autonomy_level}
            </Badge>
          </div>
        </div>
      )}
    </div>
  )
}
