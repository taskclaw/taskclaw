'use client'

import { useState } from 'react'
import {
    Settings2, Trash2, FlaskConical, Clock, Loader2,
    CheckCircle2, AlertCircle, Circle, XCircle, Timer,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type {
    IntegrationDefinition,
    IntegrationConnection,
    IntegrationConnectionStatus,
} from '@/types/integration'

interface IntegrationConnectionCardProps {
    definition: IntegrationDefinition
    connection: IntegrationConnection
    mode: 'settings' | 'board'
    isOnBoard?: boolean
    onEdit: () => void
    onDisconnect: () => void
    onTest: () => void
    onToggleBoard?: (add: boolean) => void
    testLoading?: boolean
    disconnectLoading?: boolean
}

function StatusBadge({ status }: { status: IntegrationConnectionStatus }) {
    const config: Record<IntegrationConnectionStatus, { icon: React.ReactNode; label: string; className: string }> = {
        active: {
            icon: <CheckCircle2 className="w-3 h-3" />,
            label: 'Connected',
            className: 'text-green-600 bg-green-500/10 border-green-500/20',
        },
        error: {
            icon: <XCircle className="w-3 h-3" />,
            label: 'Error',
            className: 'text-red-500 bg-red-500/10 border-red-500/20',
        },
        expired: {
            icon: <Timer className="w-3 h-3" />,
            label: 'Expired',
            className: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
        },
        revoked: {
            icon: <AlertCircle className="w-3 h-3" />,
            label: 'Revoked',
            className: 'text-red-400 bg-red-500/10 border-red-500/20',
        },
        pending: {
            icon: <Circle className="w-3 h-3" />,
            label: 'Pending',
            className: 'text-muted-foreground bg-muted border-muted',
        },
    }

    const c = config[status] ?? config.pending
    return (
        <Badge variant="outline" className={cn('text-[10px] gap-1', c.className)}>
            {c.icon}
            {c.label}
        </Badge>
    )
}

export function IntegrationConnectionCard({
    definition,
    connection,
    mode,
    isOnBoard,
    onEdit,
    onDisconnect,
    onTest,
    onToggleBoard,
    testLoading,
    disconnectLoading,
}: IntegrationConnectionCardProps) {
    const lastUsed = connection.last_used_at
        ? new Date(connection.last_used_at).toLocaleString()
        : 'Never'

    return (
        <Card className={cn(
            'transition-colors',
            connection.status === 'active' && 'border-green-500/15',
            connection.status === 'error' && 'border-red-500/15',
        )}>
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0 mt-0.5">
                        {definition.icon || '🔌'}
                    </span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold truncate">
                                {definition.name}
                            </h3>
                            <StatusBadge status={connection.status} />
                        </div>

                        {connection.external_account_name && (
                            <p className="text-xs text-muted-foreground truncate">
                                {connection.external_account_name}
                            </p>
                        )}

                        {connection.error_message && (
                            <p className="text-xs text-red-500 mt-1 line-clamp-2">
                                {connection.error_message}
                            </p>
                        )}

                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1.5">
                            <span className="flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                Last used: {lastUsed}
                            </span>
                            <span className="capitalize">{definition.auth_type.replace('_', ' ')}</span>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={onEdit}
                    >
                        <Settings2 className="w-3 h-3 mr-1" />
                        Edit
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={onTest}
                        disabled={testLoading}
                    >
                        {testLoading ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                            <FlaskConical className="w-3 h-3 mr-1" />
                        )}
                        Test
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                        onClick={onDisconnect}
                        disabled={disconnectLoading}
                    >
                        {disconnectLoading ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                            <Trash2 className="w-3 h-3 mr-1" />
                        )}
                        Disconnect
                    </Button>

                    {mode === 'board' && onToggleBoard && (
                        <Button
                            variant={isOnBoard ? 'secondary' : 'outline'}
                            size="sm"
                            className={cn(
                                'h-7 text-xs ml-auto',
                                isOnBoard && 'bg-primary/10 text-primary border-primary/20'
                            )}
                            onClick={() => onToggleBoard(!isOnBoard)}
                        >
                            {isOnBoard ? 'On Board' : 'Add to Board'}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
