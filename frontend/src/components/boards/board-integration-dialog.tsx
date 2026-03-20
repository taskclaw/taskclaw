'use client'

import { useState, useEffect } from 'react'
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Circle } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { updateBoardIntegration } from '@/app/dashboard/boards/actions'
import { toast } from 'sonner'
import type { IntegrationStatus } from '@/types/board'

interface BoardIntegrationDialogProps {
    integration: IntegrationStatus
    boardId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}

export function BoardIntegrationDialog({
    integration,
    boardId,
    open,
    onOpenChange,
    onSaved,
}: BoardIntegrationDialogProps) {
    const [enabled, setEnabled] = useState(integration.enabled)
    const [config, setConfig] = useState<Record<string, string>>(integration.config || {})
    const [showFields, setShowFields] = useState<Record<string, boolean>>({})
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setEnabled(integration.enabled)
        setConfig(integration.config || {})
        setShowFields({})
    }, [integration])

    const handleSave = async () => {
        setSaving(true)
        try {
            const result = await updateBoardIntegration(boardId, integration.slug, {
                enabled,
                config,
            })
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`${integration.name} updated`)
                onSaved()
                onOpenChange(false)
            }
        } catch {
            toast.error('Failed to save integration')
        } finally {
            setSaving(false)
        }
    }

    const statusBadge = () => {
        if (integration.enabled && integration.has_config) {
            return (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Connected
                </Badge>
            )
        }
        if (integration.required) {
            return (
                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Required
                </Badge>
            )
        }
        return (
            <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">
                <Circle className="w-3 h-3 mr-1" />
                Not configured
            </Badge>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">{integration.icon}</span>
                        <div className="flex-1">
                            <DialogTitle className="text-sm">{integration.name}</DialogTitle>
                            <DialogDescription className="text-xs mt-0.5">
                                {integration.description}
                            </DialogDescription>
                        </div>
                        {statusBadge()}
                    </div>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Setup Guide */}
                    {integration.setup_guide && (
                        <div className="bg-accent/50 rounded-lg p-3 text-xs text-muted-foreground leading-relaxed">
                            {integration.setup_guide}
                        </div>
                    )}

                    {/* Config Fields */}
                    {integration.config_fields.length > 0 && (
                        <div className="space-y-3">
                            {integration.config_fields.map((field) => (
                                <div key={field.key} className="space-y-1.5">
                                    <Label className="text-xs font-medium">
                                        {field.label}
                                        {field.required && (
                                            <span className="text-destructive ml-0.5">*</span>
                                        )}
                                    </Label>

                                    {field.type === 'boolean' ? (
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={config[field.key] === 'true'}
                                                onCheckedChange={(checked) =>
                                                    setConfig((prev) => ({
                                                        ...prev,
                                                        [field.key]: String(checked),
                                                    }))
                                                }
                                            />
                                        </div>
                                    ) : field.type === 'password' ? (
                                        <div className="relative">
                                            <Input
                                                type={showFields[field.key] ? 'text' : 'password'}
                                                value={config[field.key] ?? ''}
                                                onChange={(e) =>
                                                    setConfig((prev) => ({
                                                        ...prev,
                                                        [field.key]: e.target.value,
                                                    }))
                                                }
                                                placeholder={field.placeholder || field.label}
                                                className="pr-10"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-full px-3"
                                                onClick={() =>
                                                    setShowFields((prev) => ({
                                                        ...prev,
                                                        [field.key]: !prev[field.key],
                                                    }))
                                                }
                                            >
                                                {showFields[field.key] ? (
                                                    <EyeOff className="h-4 w-4" />
                                                ) : (
                                                    <Eye className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    ) : (
                                        <Input
                                            type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
                                            value={config[field.key] ?? ''}
                                            onChange={(e) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    [field.key]: e.target.value,
                                                }))
                                            }
                                            placeholder={field.placeholder || field.label}
                                        />
                                    )}

                                    {field.help_text && (
                                        <p className="text-[10px] text-muted-foreground">
                                            {field.help_text}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Enable/Disable Toggle */}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                        <div>
                            <p className="text-xs font-medium">Enable Integration</p>
                            <p className="text-[10px] text-muted-foreground">
                                {enabled ? 'Active — agents can use this service' : 'Disabled — agents will skip this service'}
                            </p>
                        </div>
                        <Switch checked={enabled} onCheckedChange={setEnabled} />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
