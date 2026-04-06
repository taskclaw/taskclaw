'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Loader2, FlaskConical } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useBackboneDefinitions } from '@/hooks/use-backbone-definitions'
import type {
    BackboneDefinition,
    BackboneConfigSchemaField,
    BackboneConnection,
    CreateBackboneConnectionPayload,
    UpdateBackboneConnectionPayload,
} from '@/types/backbone'

// ============================================================================
// Types
// ============================================================================

interface BackboneConnectionDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    connection?: BackboneConnection | null
    onSave: (data: CreateBackboneConnectionPayload | (UpdateBackboneConnectionPayload & { connectionId: string })) => Promise<void>
    onTest?: (connectionId: string) => Promise<void>
    saving?: boolean
    testing?: boolean
}

interface FormValues {
    backbone_type: string
    name: string
    description: string
    is_default: boolean
    config: Record<string, any>
}

// ============================================================================
// Single config field renderer
// ============================================================================

function ConfigField({
    field,
    value,
    onChange,
}: {
    field: BackboneConfigSchemaField
    value: any
    onChange: (val: any) => void
}) {
    const isPassword = field.type === 'secret'
    const isNumber = field.type === 'number'

    return (
        <div className="space-y-1.5">
            <Label className="text-xs">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </Label>
            <Input
                type={isPassword ? 'password' : isNumber ? 'number' : 'text'}
                value={value ?? ''}
                onChange={(e) =>
                    onChange(isNumber ? Number(e.target.value) : e.target.value)
                }
                placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                className="text-sm"
            />
        </div>
    )
}

// ============================================================================
// Dialog
// ============================================================================

export function BackboneConnectionDialog({
    open,
    onOpenChange,
    connection,
    onSave,
    onTest,
    saving,
    testing,
}: BackboneConnectionDialogProps) {
    const { data: definitions = [] } = useBackboneDefinitions()
    const isEdit = !!connection

    const { control, handleSubmit, watch, setValue, reset } = useForm<FormValues>({
        defaultValues: {
            backbone_type: '',
            name: '',
            description: '',
            is_default: false,
            config: {},
        },
    })

    const selectedSlug = watch('backbone_type')
    const configValues = watch('config')

    const selectedDefinition = useMemo(
        () => definitions.find((d) => d.slug === selectedSlug) ?? null,
        [definitions, selectedSlug]
    )

    // Populate form when editing
    useEffect(() => {
        if (open && connection) {
            reset({
                backbone_type: connection.backbone_type,
                name: connection.name,
                description: connection.description ?? '',
                is_default: connection.is_default,
                config: connection.config ?? {},
            })
        } else if (open) {
            reset({
                backbone_type: '',
                name: '',
                description: '',
                is_default: false,
                config: {},
            })
        }
    }, [open, connection, reset])

    // When definition changes (create mode), reset config and auto-set name
    useEffect(() => {
        if (!isEdit && selectedDefinition) {
            setValue('config', {})
            const currentName = watch('name')
            if (!currentName) {
                setValue('name', `My ${selectedDefinition.label}`)
            }
        }
    }, [selectedSlug]) // eslint-disable-line react-hooks/exhaustive-deps

    const onSubmit = async (values: FormValues) => {
        if (!values.backbone_type) {
            toast.error('Please select a backbone type')
            return
        }
        if (!values.name.trim()) {
            toast.error('Name is required')
            return
        }

        try {
            if (isEdit && connection) {
                await onSave({
                    connectionId: connection.id,
                    name: values.name.trim(),
                    description: values.description.trim() || undefined,
                    config: values.config,
                    is_default: values.is_default,
                })
            } else {
                await onSave({
                    backbone_type: values.backbone_type,
                    name: values.name.trim(),
                    description: values.description.trim() || undefined,
                    config: values.config,
                    is_default: values.is_default,
                })
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to save backbone connection')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-sm">
                        {isEdit ? 'Edit Backbone Connection' : 'Add Backbone Connection'}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {isEdit
                            ? 'Update the connection settings for this AI backbone.'
                            : 'Connect a new AI backbone provider to your account.'
                        }
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {/* Backbone type selector (disabled when editing) */}
                    <div className="space-y-1.5">
                        <Label className="text-xs">
                            Backbone Type <span className="text-red-500">*</span>
                        </Label>
                        <Controller
                            name="backbone_type"
                            control={control}
                            rules={{ required: true }}
                            render={({ field }) => (
                                <Select
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    disabled={isEdit}
                                >
                                    <SelectTrigger className="text-sm">
                                        <SelectValue placeholder="Select a backbone type..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {definitions
                                            .filter((d) => d.available)
                                            .map((def) => (
                                                <SelectItem key={def.slug} value={def.slug}>
                                                    <div className="flex items-center gap-2">
                                                        <span>{def.icon || '🧠'}</span>
                                                        <span className="font-medium">{def.label}</span>
                                                        <span className="text-xs text-muted-foreground capitalize">
                                                            ({def.protocol})
                                                        </span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </div>

                    {/* Connection name */}
                    <div className="space-y-1.5">
                        <Label className="text-xs">
                            Connection Name <span className="text-red-500">*</span>
                        </Label>
                        <Controller
                            name="name"
                            control={control}
                            rules={{ required: true }}
                            render={({ field }) => (
                                <Input
                                    {...field}
                                    placeholder="e.g. Production OpenClaw"
                                    className="text-sm"
                                />
                            )}
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <Label className="text-xs">Description</Label>
                        <Controller
                            name="description"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    {...field}
                                    placeholder="Optional description..."
                                    className="text-sm"
                                />
                            )}
                        />
                    </div>

                    {/* Dynamic config fields from schema */}
                    {selectedDefinition && selectedDefinition.configSchema.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Configuration
                            </h4>
                            {selectedDefinition.configSchema.map((schemaField) => (
                                <ConfigField
                                    key={schemaField.key}
                                    field={schemaField}
                                    value={configValues[schemaField.key]}
                                    onChange={(val) => {
                                        setValue('config', { ...configValues, [schemaField.key]: val })
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {selectedDefinition && selectedDefinition.configSchema.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">
                            No additional configuration required for this backbone type.
                        </p>
                    )}
                </form>

                <DialogFooter className="flex items-center justify-between pt-2">
                    {isEdit && connection && onTest ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onTest(connection.id)}
                            disabled={testing}
                        >
                            {testing ? (
                                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                            ) : (
                                <FlaskConical className="w-3 h-3 mr-1.5" />
                            )}
                            Test Connection
                        </Button>
                    ) : (
                        <div />
                    )}
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSubmit(onSubmit)}
                            disabled={saving || !selectedSlug}
                        >
                            {saving && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                            {isEdit ? 'Save Changes' : 'Create Connection'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
