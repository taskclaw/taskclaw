'use client'

import { cn } from '@/lib/utils'
import type { AgentStatus } from '@/types/agent'

const STATUS_CONFIG: Record<AgentStatus, { label: string; dotClass: string; textClass: string }> = {
    idle:    { label: 'Idle',    dotClass: 'bg-zinc-400',             textClass: 'text-zinc-400' },
    working: { label: 'Working', dotClass: 'bg-green-500 animate-pulse', textClass: 'text-green-400' },
    paused:  { label: 'Paused', dotClass: 'bg-amber-400',            textClass: 'text-amber-400' },
    error:   { label: 'Error',   dotClass: 'bg-red-500',              textClass: 'text-red-400' },
    offline: { label: 'Offline', dotClass: 'bg-zinc-600',             textClass: 'text-zinc-500' },
}

interface AgentStatusBadgeProps {
    status: AgentStatus
    showLabel?: boolean
    className?: string
}

export function AgentStatusBadge({ status, showLabel = true, className }: AgentStatusBadgeProps) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle
    return (
        <span className={cn('flex items-center gap-1.5', className)}>
            <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dotClass)} />
            {showLabel && (
                <span className={cn('text-[10px] font-bold uppercase tracking-wider', cfg.textClass)}>
                    {cfg.label}
                </span>
            )}
        </span>
    )
}
