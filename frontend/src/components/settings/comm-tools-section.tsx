'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Loader2, RefreshCw, CheckCircle, XCircle, HelpCircle,
    AlertTriangle, Send, MessageCircle, Hash, Clock, Wifi, WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    getCommToolStatuses,
    toggleCommTool,
    updateCommToolConfig,
    checkCommToolNow,
    type CommToolStatus,
} from '@/app/dashboard/settings/comm-tools/actions'

// ============================================================================
// Tool Definitions
// ============================================================================

const COMM_TOOLS = [
    {
        type: 'telegram' as const,
        name: 'Telegram',
        description: 'Send and receive messages via Telegram bots',
        icon: Send,
        color: '#0088cc',
    },
    {
        type: 'whatsapp' as const,
        name: 'WhatsApp',
        description: 'Send messages via WhatsApp Business API',
        icon: MessageCircle,
        color: '#25D366',
    },
    {
        type: 'slack' as const,
        name: 'Slack',
        description: 'Post messages to Slack channels and DMs',
        icon: Hash,
        color: '#4A154B',
    },
]

const INTERVAL_OPTIONS = [
    { value: '1', label: '1 min' },
    { value: '2', label: '2 min' },
    { value: '5', label: '5 min' },
    { value: '10', label: '10 min' },
    { value: '15', label: '15 min' },
    { value: '30', label: '30 min' },
    { value: '60', label: '60 min' },
]

// ============================================================================
// Health Status Badge
// ============================================================================

function HealthStatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'healthy':
            return (
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Healthy
                </Badge>
            )
        case 'unhealthy':
            return (
                <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 gap-1">
                    <XCircle className="h-3 w-3" />
                    Unhealthy
                </Badge>
            )
        case 'checking':
            return (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking...
                </Badge>
            )
        default:
            return (
                <Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 gap-1">
                    <HelpCircle className="h-3 w-3" />
                    Not checked
                </Badge>
            )
    }
}

// ============================================================================
// Relative Time Helper
// ============================================================================

function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return 'Never'
    const diff = Date.now() - new Date(dateStr).getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}

// ============================================================================
// Tool Card
// ============================================================================

function CommToolCard({
    tool,
    status,
    disabled,
    onToggle,
    onCheck,
    onUpdateInterval,
}: {
    tool: typeof COMM_TOOLS[number]
    status: CommToolStatus
    disabled: boolean
    onToggle: (enabled: boolean) => Promise<void>
    onCheck: () => Promise<void>
    onUpdateInterval: (minutes: number) => Promise<void>
}) {
    const [toggling, setToggling] = useState(false)
    const [checking, setChecking] = useState(false)
    const Icon = tool.icon

    const handleToggle = async (checked: boolean) => {
        setToggling(true)
        try {
            await onToggle(checked)
        } finally {
            setToggling(false)
        }
    }

    const handleCheck = async () => {
        setChecking(true)
        try {
            await onCheck()
        } finally {
            setChecking(false)
        }
    }

    return (
        <Card className={cn(
            'transition-all duration-200',
            disabled && 'opacity-50 pointer-events-none',
            status.is_enabled && 'border-primary/30',
        )}>
            <CardContent className="py-4 px-5">
                {/* Main row: icon, name, description, toggle */}
                <div className="flex items-center gap-4">
                    <div
                        className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0"
                        style={{ backgroundColor: `${tool.color}20` }}
                    >
                        <Icon className="h-5 w-5" style={{ color: tool.color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm">{tool.name}</h3>
                            {status.is_enabled && (
                                <HealthStatusBadge status={status.health_status} />
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {tool.description}
                        </p>
                    </div>

                    <div className="shrink-0">
                        {toggling ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                            <Switch
                                checked={status.is_enabled}
                                onCheckedChange={handleToggle}
                                disabled={disabled}
                            />
                        )}
                    </div>
                </div>

                {/* Expanded area when enabled */}
                {status.is_enabled && (
                    <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        {/* Last checked */}
                        <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>Checked: {formatRelativeTime(status.last_checked_at)}</span>
                        </div>

                        {/* Check interval */}
                        <div className="flex items-center gap-1.5">
                            <span>Interval:</span>
                            <Select
                                value={String(status.check_interval_minutes)}
                                onValueChange={(val) => onUpdateInterval(Number(val))}
                            >
                                <SelectTrigger className="h-6 w-[72px] text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {INTERVAL_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Check Now button */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs gap-1"
                            onClick={handleCheck}
                            disabled={checking}
                        >
                            {checking ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <RefreshCw className="h-3 w-3" />
                            )}
                            Check Now
                        </Button>

                        {/* Error */}
                        {status.last_error && (
                            <div className="w-full flex items-start gap-1.5 mt-1 text-red-500 dark:text-red-400">
                                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                <span className="text-xs">{status.last_error}</span>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

// ============================================================================
// Main Section Component
// ============================================================================

export function CommToolsSection({ openClawConnected }: { openClawConnected: boolean }) {
    const [tools, setTools] = useState<CommToolStatus[]>([])
    const [loading, setLoading] = useState(true)

    const loadTools = useCallback(async () => {
        try {
            const data = await getCommToolStatuses()
            setTools(data)
        } catch {
            console.error('Failed to load comm tools')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadTools()
    }, [loadTools])

    const handleToggle = async (toolType: string, enabled: boolean) => {
        const result = await toggleCommTool(toolType, enabled)
        if (result.error) {
            toast.error(result.error)
            return
        }
        if (result.data) {
            setTools((prev) =>
                prev.map((t) => (t.tool_type === toolType ? result.data! : t)),
            )
            toast.success(
                enabled
                    ? result.data.last_error
                        ? `${toolType} enabled (gateway unreachable)`
                        : `${toolType} enabled — OpenClaw connected`
                    : `${toolType} disabled`,
            )
        }
    }

    const handleCheck = async (toolType: string) => {
        const result = await checkCommToolNow(toolType)
        if (result.error) {
            toast.error(result.error)
            return
        }
        if (result.data) {
            setTools((prev) =>
                prev.map((t) => (t.tool_type === toolType ? result.data! : t)),
            )
        }
    }

    const handleUpdateInterval = async (toolType: string, minutes: number) => {
        const result = await updateCommToolConfig(toolType, {
            check_interval_minutes: minutes,
        })
        if (result.error) {
            toast.error(result.error)
            return
        }
        if (result.data) {
            setTools((prev) =>
                prev.map((t) => (t.tool_type === toolType ? result.data! : t)),
            )
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {/* OpenClaw not connected warning */}
            {!openClawConnected && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800/50 text-yellow-800 dark:text-yellow-300 text-sm">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    <span>
                        Connect OpenClaw first in{' '}
                        <a
                            href="/dashboard/settings/ai-provider"
                            className="underline font-medium hover:text-yellow-900 dark:hover:text-yellow-200"
                        >
                            AI Provider settings
                        </a>{' '}
                        to enable communication tools.
                    </span>
                </div>
            )}

            {/* Tool cards */}
            {COMM_TOOLS.map((tool) => {
                const status = tools.find((t) => t.tool_type === tool.type) || {
                    tool_type: tool.type,
                    is_enabled: false,
                    health_status: 'unknown' as const,
                    last_checked_at: null,
                    last_healthy_at: null,
                    last_error: null,
                    check_interval_minutes: 5,
                    config: {},
                }

                return (
                    <CommToolCard
                        key={tool.type}
                        tool={tool}
                        status={status}
                        disabled={!openClawConnected}
                        onToggle={(enabled) => handleToggle(tool.type, enabled)}
                        onCheck={() => handleCheck(tool.type)}
                        onUpdateInterval={(minutes) => handleUpdateInterval(tool.type, minutes)}
                    />
                )
            })}
        </div>
    )
}
