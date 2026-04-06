'use client'

import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { BackboneHealthStatus } from '@/types/backbone'

const STATUS_CONFIG: Record<
    BackboneHealthStatus,
    { label: string; dotClass: string; badgeClass: string; spinning?: boolean }
> = {
    healthy: {
        label: 'Healthy',
        dotClass: 'bg-green-500',
        badgeClass: 'text-green-600 bg-green-500/10 border-green-500/20',
    },
    unhealthy: {
        label: 'Unhealthy',
        dotClass: 'bg-red-500',
        badgeClass: 'text-red-500 bg-red-500/10 border-red-500/20',
    },
    checking: {
        label: 'Checking',
        dotClass: 'bg-yellow-500',
        badgeClass: 'text-yellow-600 bg-yellow-500/10 border-yellow-500/20',
        spinning: true,
    },
    unknown: {
        label: 'Unknown',
        dotClass: 'bg-gray-400',
        badgeClass: 'text-muted-foreground bg-muted border-muted',
    },
}

interface BackboneHealthBadgeProps {
    status: BackboneHealthStatus
    className?: string
}

export function BackboneHealthBadge({ status, className }: BackboneHealthBadgeProps) {
    const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown

    return (
        <Badge
            variant="outline"
            className={cn('text-[10px] gap-1', config.badgeClass, className)}
        >
            {config.spinning ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ) : (
                <span className={cn('w-2 h-2 rounded-full shrink-0', config.dotClass)} />
            )}
            {config.label}
        </Badge>
    )
}
