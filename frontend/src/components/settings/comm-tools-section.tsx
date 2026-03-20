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
    AlertTriangle, Send, MessageCircle, Hash, Clock, WifiOff, Settings2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    getConnectionsByCategory,
    getDefinitionsByCategory,
    toggleConnection,
    checkConnectionHealth,
    updateConnection,
    createConnection,
} from '@/app/dashboard/settings/integrations/integration-actions'
import { IntegrationSetupDialog } from '@/components/integrations/integration-setup-dialog'
import type { IntegrationDefinition, IntegrationConnection } from '@/types/integration'

// ============================================================================
// Tool Visual Config (icon + color for known comm tools)
// ============================================================================

const COMM_TOOL_VISUALS: Record<string, { icon: typeof Send; color: string }> = {
    'telegram-comm': { icon: Send, color: '#0088cc' },
    'whatsapp-comm': { icon: MessageCircle, color: '#25D366' },
    'slack-comm': { icon: Hash, color: '#4A154B' },
}

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

function formatRelativeTime(dateStr: string | null | undefined): string {
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
    definition,
    connection,
    disabled,
    onToggle,
    onCheck,
    onUpdateInterval,
    onOpenSetup,
}: {
    definition: IntegrationDefinition
    connection: IntegrationConnection | null
    disabled: boolean
    onToggle: (enabled: boolean) => Promise<void>
    onCheck: () => Promise<void>
    onUpdateInterval: (minutes: number) => Promise<void>
    onOpenSetup: () => void
}) {
    const [toggling, setToggling] = useState(false)
    const [checking, setChecking] = useState(false)

    const visual = COMM_TOOL_VISUALS[definition.slug] || { icon: Settings2, color: '#888' }
    const Icon = visual.icon

    const isEnabled = connection?.status === 'active'
    const healthStatus = connection?.health_status || 'unknown'
    const lastCheckedAt = connection?.last_checked_at
    const checkIntervalMinutes = connection?.check_interval_minutes || 5
    const lastError = connection?.error_message

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
            isEnabled && 'border-primary/30',
        )}>
            <CardContent className="py-4 px-5">
                {/* Main row: icon, name, description, toggle */}
                <div className="flex items-center gap-4">
                    <button
                        className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0 hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer"
                        style={{ backgroundColor: `${visual.color}20` }}
                        onClick={onOpenSetup}
                        title={`Configure ${definition.name}`}
                    >
                        <Icon className="h-5 w-5" style={{ color: visual.color }} />
                    </button>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <button
                                className="font-semibold text-sm hover:text-primary transition-colors cursor-pointer"
                                onClick={onOpenSetup}
                            >
                                {definition.name}
                            </button>
                            {isEnabled && (
                                <HealthStatusBadge status={healthStatus} />
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {definition.description}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                            onClick={onOpenSetup}
                            title={`Configure ${definition.name}`}
                        >
                            <Settings2 className="h-3.5 w-3.5" />
                            Configure
                        </Button>
                        {toggling ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                            <Switch
                                checked={isEnabled}
                                onCheckedChange={handleToggle}
                                disabled={disabled}
                            />
                        )}
                    </div>
                </div>

                {/* Expanded area when enabled */}
                {isEnabled && (
                    <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        {/* Last checked */}
                        <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>Checked: {formatRelativeTime(lastCheckedAt)}</span>
                        </div>

                        {/* Check interval */}
                        <div className="flex items-center gap-1.5">
                            <span>Interval:</span>
                            <Select
                                value={String(checkIntervalMinutes)}
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
                        {lastError && (
                            <div className="w-full flex items-start gap-1.5 mt-1 text-red-500 dark:text-red-400">
                                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                <span className="text-xs">{lastError}</span>
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
    const [definitions, setDefinitions] = useState<IntegrationDefinition[]>([])
    const [connections, setConnections] = useState<IntegrationConnection[]>([])
    const [loading, setLoading] = useState(true)

    // Setup dialog state
    const [setupDef, setSetupDef] = useState<IntegrationDefinition | null>(null)
    const [setupConn, setSetupConn] = useState<IntegrationConnection | null>(null)
    const [saving, setSaving] = useState(false)

    const loadData = useCallback(async () => {
        try {
            const [defs, conns] = await Promise.all([
                getDefinitionsByCategory('communication'),
                getConnectionsByCategory('communication'),
            ])
            setDefinitions(defs)
            setConnections(conns)
        } catch {
            console.error('Failed to load comm tools')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    const getConnectionForDef = (defId: string): IntegrationConnection | null => {
        return connections.find((c) => c.definition_id === defId) || null
    }

    const handleToggle = async (definition: IntegrationDefinition, enabled: boolean) => {
        const conn = getConnectionForDef(definition.id)

        if (!conn) {
            // Need to create a connection first, then toggle it on
            if (enabled) {
                try {
                    const result = await createConnection({
                        definition_id: definition.id,
                        config: {},
                    })
                    if (result.error) {
                        toast.error(result.error)
                        return
                    }
                    // Now toggle the newly created connection
                    const newConn = result as IntegrationConnection
                    if (newConn.id) {
                        const toggleResult = await toggleConnection(newConn.id, true)
                        if (toggleResult.error) {
                            toast.error(toggleResult.error)
                            return
                        }
                    }
                    toast.success(`${definition.name} enabled`)
                    loadData()
                } catch (err: any) {
                    toast.error(err.message || 'Failed to enable')
                }
            }
            return
        }

        const result = await toggleConnection(conn.id, enabled)
        if (result.error) {
            toast.error(result.error)
            return
        }
        toast.success(
            enabled
                ? `${definition.name} enabled`
                : `${definition.name} disabled`,
        )
        loadData()
    }

    const handleCheck = async (definition: IntegrationDefinition) => {
        const conn = getConnectionForDef(definition.id)
        if (!conn) return

        const result = await checkConnectionHealth(conn.id)
        if (result.error) {
            toast.error(result.error)
            return
        }
        loadData()
    }

    const handleUpdateInterval = async (definition: IntegrationDefinition, minutes: number) => {
        const conn = getConnectionForDef(definition.id)
        if (!conn) return

        const result = await updateConnection(conn.id, {
            config: { ...conn.config, check_interval_minutes: minutes },
        })
        if (result.error) {
            toast.error(result.error)
            return
        }
        loadData()
    }

    const handleOpenSetup = (definition: IntegrationDefinition) => {
        const conn = getConnectionForDef(definition.id)
        setSetupDef(definition)
        setSetupConn(conn)
    }

    const handleSaveSetup = async (
        credentials: Record<string, string>,
        config: Record<string, any>,
        externalName?: string,
    ) => {
        if (!setupDef) return
        setSaving(true)
        try {
            const conn = getConnectionForDef(setupDef.id)
            if (conn) {
                const result = await updateConnection(conn.id, {
                    credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
                    config,
                    external_account_name: externalName,
                })
                if (result.error) {
                    toast.error(result.error)
                    return
                }
                toast.success(`${setupDef.name} updated`)
            } else {
                const result = await createConnection({
                    definition_id: setupDef.id,
                    credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
                    config,
                    external_account_name: externalName,
                })
                if (result.error) {
                    toast.error(result.error)
                    return
                }
                toast.success(`${setupDef.name} connected`)
            }
            setSetupDef(null)
            setSetupConn(null)
            loadData()
        } finally {
            setSaving(false)
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
            {definitions.map((def) => {
                const conn = getConnectionForDef(def.id)
                return (
                    <CommToolCard
                        key={def.id}
                        definition={def}
                        connection={conn}
                        disabled={!openClawConnected}
                        onToggle={(enabled) => handleToggle(def, enabled)}
                        onCheck={() => handleCheck(def)}
                        onUpdateInterval={(minutes) => handleUpdateInterval(def, minutes)}
                        onOpenSetup={() => handleOpenSetup(def)}
                    />
                )
            })}

            {definitions.length === 0 && !loading && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                    No communication tool definitions found. They will appear here after the system is configured.
                </div>
            )}

            {/* Setup Dialog */}
            {setupDef && (
                <IntegrationSetupDialog
                    definition={setupDef}
                    connection={setupConn}
                    open={!!setupDef}
                    onOpenChange={(open) => {
                        if (!open) {
                            setSetupDef(null)
                            setSetupConn(null)
                        }
                    }}
                    onSave={handleSaveSetup}
                    saving={saving}
                />
            )}
        </div>
    )
}
