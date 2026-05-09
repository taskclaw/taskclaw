'use client'

import { Activity } from 'lucide-react'
import { CockpitExecutionFeed, type DelegationMeta } from './cockpit-execution-feed'
import { OrchestrationGroup } from './orchestration-group'
import type { ActiveOrchestration } from '@/hooks/use-live-execution'

interface LiveExecutionPanelProps {
    /** Feed A: current session delegations */
    sessionDelegations: DelegationMeta[]
    /** Feed B: all active orchestrations from Realtime hook */
    activeTasks: ActiveOrchestration[]
    /** Live statuses from Realtime, keyed by orchestration_id */
    liveStatuses: Record<string, string>
}

export function LiveExecutionPanel({
    sessionDelegations,
    activeTasks,
    liveStatuses,
}: LiveExecutionPanelProps) {
    // Feed B: background tasks = active tasks NOT already shown in Feed A
    const sessionIds = new Set(sessionDelegations.map(d => d.orchestration_id))
    const backgroundTasks = activeTasks.filter(t => !sessionIds.has(t.id))

    const hasSession = sessionDelegations.length > 0
    const hasBackground = backgroundTasks.length > 0

    return (
        <div className="flex flex-col gap-0 h-full overflow-y-auto">
            {/* Feed A — THIS SESSION */}
            {hasSession && (
                <div>
                    <div className="px-3 py-2 flex items-center gap-1.5 shrink-0 border-b"
                        style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <span className="text-[9px] font-bold tracking-[0.2em] uppercase"
                            style={{ color: 'rgba(255,255,255,0.3)' }}>
                            This Session
                        </span>
                    </div>
                    <CockpitExecutionFeed
                        delegations={sessionDelegations}
                        liveStatuses={liveStatuses}
                    />
                </div>
            )}

            {/* Separator between feeds */}
            {hasSession && hasBackground && (
                <div className="h-px mx-3 my-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
            )}

            {/* Feed B — RUNNING NOW */}
            {hasBackground && (
                <div>
                    <div className="px-3 py-2 flex items-center gap-1.5 shrink-0 border-b"
                        style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <Activity className="w-3 h-3" style={{ color: 'rgba(143,245,255,0.5)' }} />
                        <span className="text-[9px] font-bold tracking-[0.2em] uppercase"
                            style={{ color: 'rgba(255,255,255,0.3)' }}>
                            Running Now
                        </span>
                    </div>
                    <div className="flex flex-col gap-2 p-2">
                        {backgroundTasks.map(task => (
                            <OrchestrationGroup
                                key={task.id}
                                orchestration={task}
                                liveStatus={liveStatuses[task.id]}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state when nothing active */}
            {!hasSession && !hasBackground && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Activity className="w-8 h-8" style={{ color: 'rgba(143,245,255,0.1)' }} />
                    <p className="text-[11px] text-center" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        No active executions
                    </p>
                </div>
            )}
        </div>
    )
}
