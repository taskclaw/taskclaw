'use client'

import { useState, useEffect, useCallback } from 'react'
import { History, AlertTriangle, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLiveExecution } from '@/hooks/use-live-execution'
import { LiveExecutionPanel } from './live-execution-panel'
import type { DelegationMeta } from './cockpit-execution-feed'
import type { BlockedTask } from '@/hooks/use-blocked-tasks'
import { useTaskStore } from '@/hooks/use-task-store'

type PanelMode = 'history' | 'live'

interface CockpitRightPanelProps {
    /** Delegations from current chat session (Feed A) */
    sessionDelegations: DelegationMeta[]
    /** Account ID for Realtime subscription */
    accountId: string | null
    /** The existing 24H timeline JSX shown in history mode */
    children: React.ReactNode
    /** Blocked tasks from Realtime subscription */
    blockedTasks?: BlockedTask[]
}

export function CockpitRightPanel({
    sessionDelegations,
    accountId,
    children,
    blockedTasks = [],
}: CockpitRightPanelProps) {
    const { activeTasks, isConnected } = useLiveExecution(accountId)
    const [mode, setMode] = useState<PanelMode>('history')
    const [showHistoryPeek, setShowHistoryPeek] = useState(false)
    const [idleTimer, setIdleTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
    // Track live statuses from Realtime
    const [liveStatuses, setLiveStatuses] = useState<Record<string, string>>({})
    const setSelectedTaskId = useTaskStore((s) => s.setSelectedTaskId)

    // Sync liveStatuses from activeTasks
    useEffect(() => {
        const statusMap: Record<string, string> = {}
        for (const t of activeTasks) {
            statusMap[t.id] = t.status
        }
        setLiveStatuses(statusMap)
    }, [activeTasks])

    const activeCount = activeTasks.length + sessionDelegations.filter(d => {
        const live = liveStatuses[d.orchestration_id] ?? d.status
        return live === 'running' || live === 'pending_approval' || live === 'pending'
    }).length

    const handleIdleTransition = useCallback(() => {
        if (idleTimer) clearTimeout(idleTimer)
        const timer = setTimeout(() => {
            setMode('history')
            setShowHistoryPeek(false)
        }, 5000)
        setIdleTimer(timer)
    }, [idleTimer])

    // State machine: transition based on activeCount
    useEffect(() => {
        if (activeCount > 0) {
            if (idleTimer) {
                clearTimeout(idleTimer)
                setIdleTimer(null)
            }
            setMode('live')
        } else {
            // Only start idle timer if we were in live mode
            if (mode === 'live') {
                handleIdleTransition()
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCount])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (idleTimer) clearTimeout(idleTimer)
        }
    }, [idleTimer])

    const isLiveMode = mode === 'live'

    return (
        <div className="h-full flex flex-col bg-background/60 backdrop-blur-sm">
            {/* Blocker alert section — shown in all modes when tasks are blocked */}
            {blockedTasks.length > 0 && (
                <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/5">
                    <div className="px-3 py-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="text-[9px] font-bold tracking-[0.15em] uppercase text-amber-400/80">
                            {blockedTasks.length} blocked
                        </span>
                    </div>
                    <div className="divide-y divide-amber-500/10 max-h-[180px] overflow-y-auto">
                        {blockedTasks.map((t) => (
                            <div
                                key={t.id}
                                className="px-3 py-2 flex items-start gap-2 hover:bg-amber-500/5 transition-colors cursor-pointer group"
                                onClick={() => setSelectedTaskId(t.id)}
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-semibold leading-snug" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                        {t.title}
                                    </p>
                                    {t.metadata?.blocker && (
                                        <p className="text-[9px] mt-0.5 line-clamp-2" style={{ color: 'rgba(255,209,111,0.6)' }}>
                                            {(t.metadata.blocker as any).reason}
                                        </p>
                                    )}
                                </div>
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0 mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Panel Header — only shown in live mode; history children own their own header */}
            {isLiveMode && (
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2 shrink-0">
                    <div className="flex-1">
                        <h2 className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/60 uppercase">
                            Execution
                        </h2>
                    </div>

                    {/* LIVE badge */}
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                        <span className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            isConnected ? 'bg-blue-400 animate-pulse' : 'bg-slate-400'
                        )} />
                        <span className="text-[9px] font-bold tracking-widest text-blue-400/80 uppercase">Live</span>
                    </div>

                    {/* History peek toggle */}
                    <button
                        onClick={() => setShowHistoryPeek(v => !v)}
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-medium transition-colors',
                            showHistoryPeek
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50'
                        )}
                        title="Toggle history view"
                    >
                        <History className="w-3 h-3" />
                        history
                    </button>
                </div>
            )}

            {/* Panel Content */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {isLiveMode ? (
                    <>
                        {/* Live Execution Panel */}
                        <div className={cn(
                            'flex-1 min-h-0 overflow-y-auto',
                            showHistoryPeek && 'flex-none max-h-[50%]'
                        )}>
                            <LiveExecutionPanel
                                sessionDelegations={sessionDelegations}
                                activeTasks={activeTasks}
                                liveStatuses={liveStatuses}
                            />
                        </div>

                        {/* History peek (when toggled) */}
                        {showHistoryPeek && (
                            <div className="flex-1 min-h-0 overflow-y-auto border-t border-white/5">
                                {children}
                            </div>
                        )}
                    </>
                ) : (
                    /* History / idle mode */
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {children}
                    </div>
                )}
            </div>
        </div>
    )
}
