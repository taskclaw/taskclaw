'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Loader2, FlaskConical, Zap, Search, Send, Eye, EyeOff } from 'lucide-react'
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
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { useBackboneDefinitions } from '@/hooks/use-backbone-definitions'
import { saveAiProviderConfig, getAiProviderConfig } from '@/app/dashboard/settings/ai-provider/actions'
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

interface OpenClawServices {
    openrouter_api_key: string
    brave_search_api_key: string
    telegram_bot_token: string
}

function MaskedField({ label, value, onChange, placeholder, icon: Icon }: {
    label: string
    value: string
    onChange: (v: string) => void
    placeholder: string
    icon?: React.ComponentType<{ className?: string }>
}) {
    const [show, setShow] = useState(false)
    return (
        <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
                {Icon && <Icon className="w-3 h-3 text-muted-foreground" />}
                {label}
            </Label>
            <div className="relative">
                <Input
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="text-sm pr-9"
                />
                <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                    {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
            </div>
        </div>
    )
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
    const [savingServices, setSavingServices] = useState(false)
    const [openClawServices, setOpenClawServices] = useState<OpenClawServices>({
        openrouter_api_key: '',
        brave_search_api_key: '',
        telegram_bot_token: '',
    })

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

    const isOpenClaw = selectedSlug === 'openclaw'

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

    // Load existing OpenClaw service keys when dialog opens in openclaw edit mode
    useEffect(() => {
        if (open && isOpenClaw) {
            getAiProviderConfig().then((cfg) => {
                if (cfg) {
                    setOpenClawServices({
                        openrouter_api_key: '',
                        brave_search_api_key: '',
                        telegram_bot_token: '',
                    })
                }
            })
        }
    }, [open, isOpenClaw])

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

    const handleSaveServices = async () => {
        const hasAny = openClawServices.openrouter_api_key || openClawServices.brave_search_api_key || openClawServices.telegram_bot_token
        if (!hasAny) {
            toast.info('No service credentials to save')
            return
        }
        setSavingServices(true)
        try {
            // The backend merges with existing ai_provider record if api_url/api_key are missing.
            // Pass the plain api_url from the form (visible, unencrypted) + the api_key from form if set.
            // The api_url field value is always the raw URL (the schema renderer shows plaintext for this field).
            const formApiUrl = configValues?.api_url || ''
            const isRealUrl = formApiUrl.startsWith('http')

            // Attempt to load existing ai_provider_config to supplement missing credentials
            const existing = await getAiProviderConfig()

            const payload: any = {
                api_url: isRealUrl ? formApiUrl : (existing?.api_url || ''),
            }
            // If we have an existing record, the backend will reuse its encrypted api_key
            // If not, we need to supply it — use the configValues api_key if it's been entered (not masked)
            const formApiKey = configValues?.api_key || ''
            const isMasked = formApiKey.startsWith('****') || formApiKey.startsWith('*')
            if (!isMasked && formApiKey) {
                payload.api_key = formApiKey
            }

            if (openClawServices.openrouter_api_key) payload.openrouter_api_key = openClawServices.openrouter_api_key
            if (openClawServices.brave_search_api_key) payload.brave_search_api_key = openClawServices.brave_search_api_key
            if (openClawServices.telegram_bot_token) payload.telegram_bot_token = openClawServices.telegram_bot_token
            const result = await saveAiProviderConfig(payload)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('OpenClaw service credentials saved')
                setOpenClawServices({ openrouter_api_key: '', brave_search_api_key: '', telegram_bot_token: '' })
            }
        } finally {
            setSavingServices(false)
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

                    {/* OpenClaw-specific: service credentials (OpenRouter, Brave, Telegram) */}
                    {isOpenClaw && (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        OpenClaw Service Credentials
                                    </h4>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Optional keys sent to OpenClaw for enhanced capabilities. Leave blank to keep existing.
                                    </p>
                                </div>
                                <MaskedField
                                    label="OpenRouter API Key"
                                    value={openClawServices.openrouter_api_key}
                                    onChange={(v) => setOpenClawServices((s) => ({ ...s, openrouter_api_key: v }))}
                                    placeholder="sk-or-v1-..."
                                    icon={Zap}
                                />
                                <MaskedField
                                    label="Brave Search API Key"
                                    value={openClawServices.brave_search_api_key}
                                    onChange={(v) => setOpenClawServices((s) => ({ ...s, brave_search_api_key: v }))}
                                    placeholder="BSA..."
                                    icon={Search}
                                />
                                <MaskedField
                                    label="Telegram Bot Token"
                                    value={openClawServices.telegram_bot_token}
                                    onChange={(v) => setOpenClawServices((s) => ({ ...s, telegram_bot_token: v }))}
                                    placeholder="1234567890:ABC..."
                                    icon={Send}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSaveServices}
                                    disabled={savingServices}
                                    className="w-full text-xs"
                                >
                                    {savingServices && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                                    Save Service Credentials
                                </Button>
                            </div>
                        </>
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
