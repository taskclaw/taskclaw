'use client'

import type { SchemaField } from '@/types/board'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface SchemaFieldRendererProps {
    field: SchemaField
    value: any
    onChange: (value: any) => void
    error?: string
    compact?: boolean
}

export function SchemaFieldRenderer({
    field,
    value,
    onChange,
    error,
    compact = false,
}: SchemaFieldRendererProps) {
    const resolvedValue = value ?? (field.default_value !== undefined && field.default_value !== ''
        ? coerceDefault(field.default_value, field.type)
        : undefined)

    return (
        <div className={cn('space-y-1', compact && 'space-y-0.5')}>
            {field.type !== 'boolean' && (
                <Label className={cn(
                    'text-[10px] font-bold text-muted-foreground uppercase tracking-wider',
                    compact && 'text-[10px]',
                )}>
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
            )}

            {field.type === 'text' && (
                <Input
                    value={resolvedValue ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.label}
                    className={cn(compact && 'h-8 text-sm')}
                />
            )}

            {field.type === 'number' && (
                <Input
                    type="number"
                    value={resolvedValue ?? ''}
                    onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder={field.label}
                    className={cn(compact && 'h-8 text-sm')}
                />
            )}

            {field.type === 'boolean' && (
                <div className="flex items-center gap-2">
                    <Switch
                        checked={resolvedValue ?? false}
                        onCheckedChange={onChange}
                    />
                    <Label className={cn(
                        'text-xs font-medium cursor-pointer',
                        compact && 'text-xs',
                    )}>
                        {field.label}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                </div>
            )}

            {field.type === 'date' && (
                <Input
                    type="date"
                    value={resolvedValue ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    className={cn(compact && 'h-8 text-sm')}
                />
            )}

            {(field.type === 'url' || field.type === 'email') && (
                <Input
                    type={field.type}
                    value={resolvedValue ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.label}
                    className={cn(compact && 'h-8 text-sm')}
                />
            )}

            {field.type === 'json' && (
                <textarea
                    value={typeof resolvedValue === 'object'
                        ? JSON.stringify(resolvedValue, null, 2)
                        : resolvedValue ?? ''}
                    onChange={(e) => {
                        try {
                            onChange(JSON.parse(e.target.value))
                        } catch {
                            onChange(e.target.value)
                        }
                    }}
                    placeholder={`${field.label} (JSON)`}
                    rows={3}
                    className={cn(
                        'w-full bg-transparent border border-input rounded-md px-3 py-2 text-xs font-mono outline-none resize-y',
                        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                        compact && 'text-xs py-1.5',
                    )}
                />
            )}

            {field.type === 'dropdown' && (
                <select
                    value={resolvedValue ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    className={cn(
                        'w-full bg-accent/50 border border-border rounded-lg px-3 py-2 text-xs outline-none',
                        compact && 'py-1.5 text-sm',
                    )}
                >
                    <option value="">Select {field.label}...</option>
                    {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            )}

            {error && (
                <p className="text-[10px] text-destructive font-medium">{error}</p>
            )}
        </div>
    )
}

function coerceDefault(defaultValue: string, type: SchemaField['type']): any {
    switch (type) {
        case 'number':
            return Number(defaultValue)
        case 'boolean':
            return defaultValue === 'true'
        default:
            return defaultValue
    }
}
