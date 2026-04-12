'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Loader2, Wifi, WifiOff, Zap } from 'lucide-react'
import { getSyncStatus, triggerSync } from '@/app/dashboard/settings/integrations/actions'
import { getBackboneConnections } from '@/app/dashboard/settings/backbones/actions'
import type { BackboneConnection } from '@/types/backbone'

interface SourceStatus {
    id: string
    provider: string
    sync_status: string
    last_synced_at: string | null
    last_sync_error: string | null
}

function timeAgo(dateStr: string): string {
    const now = Date.now()
    const date = new Date(dateStr).getTime()
    const seconds = Math.floor((now - date) / 1000)

    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}

/** Human-readable label for a backbone type slug */
function backboneLabel(backbone: BackboneConnection): string {
    const typeLabels: Record<string, string> = {
        'claude-code': 'Claude Code',
        'openclaw': 'OpenClaw',
        'openrouter': 'OpenRouter',
        'anthropic': 'Anthropic',
        'openai': 'OpenAI',
    }
    return backbone.name || typeLabels[backbone.backbone_type] || backbone.backbone_type
}

export function SystemStatusBar() {
    const [sources, setSources] = useState<SourceStatus[]>([])
    const [backbones, setBackbones] = useState<BackboneConnection[]>([])
    const [syncing, setSyncing] = useState(false)
    const [loadingBackbones, setLoadingBackbones] = useState(false)

    const fetchSyncStatus = useCallback(async () => {
        const result = await getSyncStatus()
        if (Array.isArray(result)) {
            setSources(result)
        }
    }, [])

    const fetchBackbones = useCallback(async () => {
        setLoadingBackbones(true)
        try {
            const result = await getBackboneConnections()
            setBackbones(Array.isArray(result) ? result : [])
        } catch {
            setBackbones([])
        } finally {
            setLoadingBackbones(false)
        }
    }, [])

    useEffect(() => {
        fetchSyncStatus()
        fetchBackbones()

        const interval = setInterval(() => {
            fetchSyncStatus()
            fetchBackbones()
        }, 30000)
        return () => clearInterval(interval)
    }, [fetchSyncStatus, fetchBackbones])

    const handleSyncAll = async () => {
        if (syncing) return
        setSyncing(true)
        try {
            for (const source of sources) {
                await triggerSync(source.id)
            }
            await fetchSyncStatus()
        } finally {
            setSyncing(false)
        }
    }

    const statusDotColor = (status: string) => {
        switch (status) {
            case 'idle': return 'bg-emerald-500'
            case 'syncing': return 'bg-yellow-500 animate-pulse'
            case 'error': return 'bg-red-500'
            case 'disabled': return 'bg-zinc-600'
            default: return 'bg-zinc-600'
        }
    }

    // Determine AI status from backbone connections
    const activeBackbones = backbones.filter((b) => b.is_active)
    const defaultBackbone = activeBackbones.find((b) => b.is_default) ?? activeBackbones[0] ?? null
    const healthyBackbone = activeBackbones.find((b) => b.health_status === 'healthy')
    const displayBackbone = defaultBackbone ?? healthyBackbone ?? null

    const aiOnline = activeBackbones.length > 0
    const aiDotColor = loadingBackbones
        ? 'bg-zinc-600'
        : aiOnline
        ? 'bg-emerald-500'
        : 'bg-red-500'

    const aiLabel = loadingBackbones
        ? 'AI...'
        : aiOnline && displayBackbone
        ? `AI Online · ${backboneLabel(displayBackbone)}`
        : 'AI Offline'

    const aiTitle = aiOnline && activeBackbones.length > 1
        ? `${activeBackbones.length} backbones active — Default: ${displayBackbone ? backboneLabel(displayBackbone) : 'none'}`
        : aiOnline && displayBackbone
        ? `AI backbone: ${backboneLabel(displayBackbone)}`
        : 'No active AI backbone — click to configure'

    return (
        <footer className="relative z-20 h-10 border-t border-border flex items-center justify-between px-6 bg-background/50 text-[10px] text-muted-foreground font-medium shrink-0">
            <div className="flex gap-5 items-center">
                {/* Source sync statuses */}
                {sources.map((source) => (
                    <div key={source.id} className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor(source.sync_status)}`} />
                        <span className="capitalize">{source.provider}</span>
                        {source.last_synced_at && (
                            <span className="text-muted-foreground/60">
                                {timeAgo(source.last_synced_at)}
                            </span>
                        )}
                        {source.sync_status === 'error' && source.last_sync_error && (
                            <span className="text-red-400 max-w-[120px] truncate" title={source.last_sync_error}>
                                {source.last_sync_error}
                            </span>
                        )}
                    </div>
                ))}

                {sources.length === 0 && (
                    <span className="text-muted-foreground/50">No sources</span>
                )}

                {/* Refresh button */}
                {sources.length > 0 && (
                    <button
                        onClick={handleSyncAll}
                        disabled={syncing}
                        className="hover:text-foreground transition-colors disabled:opacity-50"
                        title="Sync all sources"
                    >
                        {syncing ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                            <RefreshCw className="w-3 h-3" />
                        )}
                    </button>
                )}
            </div>

            <div className="flex gap-4 items-center">
                {/* AI backbone status */}
                <button
                    onClick={fetchBackbones}
                    disabled={loadingBackbones}
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors disabled:opacity-50"
                    title={aiTitle}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${aiDotColor}`} />
                    {loadingBackbones ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : aiOnline ? (
                        <Zap className="w-3 h-3 text-emerald-500" />
                    ) : (
                        <WifiOff className="w-3 h-3" />
                    )}
                    <span className={aiOnline ? 'text-emerald-600 dark:text-emerald-400' : ''}>{aiLabel}</span>
                    {/* Show count badge if multiple active backbones */}
                    {aiOnline && activeBackbones.length > 1 && (
                        <span className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1 rounded">
                            {activeBackbones.length}
                        </span>
                    )}
                </button>
            </div>
        </footer>
    )
}
