'use client'

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useBackboneConnections } from '@/hooks/use-backbone-connections'
import type { BackboneHealthStatus } from '@/types/backbone'

// ============================================================================
// Health dot (inline, tiny)
// ============================================================================

const DOT_COLOR: Record<BackboneHealthStatus, string> = {
    healthy: 'bg-green-500',
    unhealthy: 'bg-red-500',
    checking: 'bg-yellow-500',
    unknown: 'bg-gray-400',
}

function HealthDot({ status }: { status: BackboneHealthStatus }) {
    return (
        <span className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', DOT_COLOR[status] ?? DOT_COLOR.unknown)} />
    )
}

// ============================================================================
// BackbonePicker
// ============================================================================

interface BackbonePickerProps {
    value: string | null
    onChange: (value: string | null) => void
    showInheritOption?: boolean
    inheritLabel?: string
    disabled?: boolean
    className?: string
}

const INHERIT_VALUE = '__inherit__'

export function BackbonePicker({
    value,
    onChange,
    showInheritOption = false,
    inheritLabel = 'Inherit from account',
    disabled,
    className,
}: BackbonePickerProps) {
    const { data: connections = [], isLoading } = useBackboneConnections()

    const activeConnections = connections.filter((c) => c.is_active)

    const handleChange = (selected: string) => {
        if (selected === INHERIT_VALUE) {
            onChange(null)
        } else {
            onChange(selected)
        }
    }

    return (
        <Select
            value={value ?? (showInheritOption ? INHERIT_VALUE : '')}
            onValueChange={handleChange}
            disabled={disabled || isLoading}
        >
            <SelectTrigger className={cn('text-sm', className)}>
                <SelectValue placeholder={isLoading ? 'Loading...' : 'Select backbone...'} />
            </SelectTrigger>
            <SelectContent>
                {showInheritOption && (
                    <SelectItem value={INHERIT_VALUE}>
                        <span className="text-muted-foreground">{inheritLabel}</span>
                    </SelectItem>
                )}

                {activeConnections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                        <div className="flex items-center gap-2">
                            <HealthDot status={conn.health_status} />
                            <span>🧠</span>
                            <span>{conn.name}</span>
                            {conn.is_default && (
                                <span className="text-[10px] text-amber-600 ml-1">(default)</span>
                            )}
                        </div>
                    </SelectItem>
                ))}

                {activeConnections.length === 0 && !isLoading && (
                    <div className="px-2 py-3 text-xs text-center text-muted-foreground">
                        No backbone connections configured.
                    </div>
                )}
            </SelectContent>
        </Select>
    )
}
