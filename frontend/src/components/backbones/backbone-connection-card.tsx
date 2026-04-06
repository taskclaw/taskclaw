'use client'

import { useState } from 'react'
import {
    Settings2, Trash2, FlaskConical, Loader2, Star,
    MoreHorizontal, Clock, MessageSquare, Coins,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { BackboneHealthBadge } from './backbone-health-badge'
import type { BackboneConnection } from '@/types/backbone'

interface BackboneConnectionCardProps {
    connection: BackboneConnection
    onEdit: () => void
    onTest: () => void | Promise<void>
    onDelete: () => void
    onSetDefault: () => void | Promise<void>
    testLoading?: boolean
    deleteLoading?: boolean
}

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
}

export function BackboneConnectionCard({
    connection,
    onEdit,
    onTest,
    onDelete,
    onSetDefault,
    testLoading,
    deleteLoading,
}: BackboneConnectionCardProps) {
    const checkedAt = connection.health_checked_at
        ? new Date(connection.health_checked_at).toLocaleString()
        : 'Never'

    return (
        <Card className={cn(
            'transition-colors',
            connection.health_status === 'healthy' && 'border-green-500/15',
            connection.health_status === 'unhealthy' && 'border-red-500/15',
        )}>
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    {/* Icon */}
                    <span className="text-2xl shrink-0 mt-0.5">🧠</span>

                    <div className="flex-1 min-w-0">
                        {/* Name + badges */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-sm font-semibold truncate">
                                {connection.name}
                            </h3>
                            <BackboneHealthBadge status={connection.health_status} />
                            {connection.is_default && (
                                <Badge
                                    variant="secondary"
                                    className="text-[10px] gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20"
                                >
                                    <Star className="w-2.5 h-2.5 fill-current" />
                                    Default
                                </Badge>
                            )}
                        </div>

                        {/* Backbone type slug */}
                        <p className="text-xs text-muted-foreground truncate capitalize">
                            {connection.backbone_type}
                        </p>

                        {/* Usage stats */}
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1.5">
                            <span className="flex items-center gap-1">
                                <MessageSquare className="w-2.5 h-2.5" />
                                {formatNumber(connection.total_requests)} reqs
                            </span>
                            <span className="flex items-center gap-1">
                                <Coins className="w-2.5 h-2.5" />
                                {formatNumber(connection.total_tokens)} tokens
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {checkedAt}
                            </span>
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

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0 ml-auto">
                                <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {!connection.is_default && (
                                <DropdownMenuItem onClick={onSetDefault}>
                                    <Star className="w-3.5 h-3.5 mr-2" />
                                    Set as Default
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                                onClick={onDelete}
                                disabled={deleteLoading}
                                className="text-red-500 focus:text-red-600"
                            >
                                {deleteLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                ) : (
                                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                                )}
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardContent>
        </Card>
    )
}
