'use client'

import { useState, useEffect } from 'react'
import { Eye, EyeOff, Loader2, ExternalLink, Save } from 'lucide-react'
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
import { IntegrationTestChat } from './integration-test-chat'
import { toast } from 'sonner'
import type {
    IntegrationDefinition,
    IntegrationConnection,
    IntegrationAuthConfigApiKey,
    IntegrationAuthConfigOAuth2,
    IntegrationAuthKeyField,
} from '@/types/integration'

interface IntegrationSetupDialogProps {
    definition: IntegrationDefinition
    connection?: IntegrationConnection | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSave: (credentials: Record<string, string>, config: Record<string, any>, externalName?: string) => Promise<void>
    onDisconnect?: () => void
    onInitiateOAuth?: () => Promise<void>
    saving?: boolean
}

function getCredentialFields(definition: IntegrationDefinition): IntegrationAuthKeyField[] {
    if (definition.auth_type === 'api_key' || definition.auth_type === 'basic') {
        const config = definition.auth_config as IntegrationAuthConfigApiKey
        return config?.key_fields ?? []
    }
    if (definition.auth_type === 'webhook') {
        return (definition.config_fields ?? [])
            .filter((f) => f.type === 'password' || f.type === 'url')
            .map((f) => ({ ...f, type: f.type as 'password' | 'url' | 'text' | 'number' }))
    }
    return []
}

export function IntegrationSetupDialog({
    definition,
    connection,
    open,
    onOpenChange,
    onSave,
    onDisconnect,
    onInitiateOAuth,
    saving,
}: IntegrationSetupDialogProps) {
    const [credentials, setCredentials] = useState<Record<string, string>>({})
    const [config, setConfig] = useState<Record<string, any>>({})
    const [externalName, setExternalName] = useState('')
    const [showFields, setShowFields] = useState<Record<string, boolean>>({})
    const [oauthLoading, setOauthLoading] = useState(false)

    const credentialFields = getCredentialFields(definition)
    const configFields = definition.config_fields ?? []
    const isOAuth = definition.auth_type === 'oauth2'
    const isConnected = connection && (connection.status === 'active' || connection.status === 'pending')

    useEffect(() => {
        if (open) {
            setCredentials(connection?.credentials_masked ?? {})
            setConfig(connection?.config ?? {})
            setExternalName(connection?.external_account_name ?? '')
            setShowFields({})
        }
    }, [open, connection])

    const handleSave = async () => {
        try {
            await onSave(credentials, config, externalName || undefined)
        } catch (err: any) {
            toast.error(err.message || 'Failed to save')
        }
    }

    const handleOAuth = async () => {
        if (!onInitiateOAuth) return
        setOauthLoading(true)
        try {
            await onInitiateOAuth()
        } catch (err: any) {
            toast.error(err.message || 'Failed to start OAuth')
        } finally {
            setOauthLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[90vw] w-[90vw] max-h-[88vh] h-[88vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">{definition.icon || '🔌'}</span>
                        <div className="flex-1">
                            <DialogTitle className="text-sm">
                                {isConnected ? 'Manage' : 'Connect'} {definition.name}
                            </DialogTitle>
                            <DialogDescription className="text-xs mt-0.5">
                                {definition.description}
                            </DialogDescription>
                        </div>
                        {isConnected && (
                            <Badge variant="outline" className="text-[10px] text-green-600 bg-green-500/10 border-green-500/20">
                                Connected
                            </Badge>
                        )}
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
                    {/* Left: Credentials & Config */}
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                        {/* Setup Guide */}
                        {definition.setup_guide && (
                            <div className="bg-accent/50 rounded-lg p-3 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                                {definition.setup_guide}
                            </div>
                        )}

                        {/* OAuth Button */}
                        {isOAuth && !isConnected && (
                            <div className="space-y-2">
                                <Button
                                    onClick={handleOAuth}
                                    disabled={oauthLoading}
                                    className="w-full"
                                >
                                    {oauthLoading ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <ExternalLink className="w-4 h-4 mr-2" />
                                    )}
                                    Connect with {definition.name}
                                </Button>
                                <p className="text-[10px] text-muted-foreground text-center">
                                    You will be redirected to authenticate
                                </p>
                            </div>
                        )}

                        {/* Credential Fields (API Key / Basic) */}
                        {credentialFields.length > 0 && (
                            <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Credentials
                                </h4>
                                {credentialFields.map((field) => (
                                    <div key={field.key} className="space-y-1.5">
                                        <Label className="text-xs font-medium">
                                            {field.label}
                                            {field.required && (
                                                <span className="text-destructive ml-0.5">*</span>
                                            )}
                                        </Label>
                                        {field.type === 'password' ? (
                                            <div className="relative">
                                                <Input
                                                    type={showFields[field.key] ? 'text' : 'password'}
                                                    value={credentials[field.key] ?? ''}
                                                    onChange={(e) =>
                                                        setCredentials((prev) => ({
                                                            ...prev,
                                                            [field.key]: e.target.value,
                                                        }))
                                                    }
                                                    placeholder={field.placeholder || field.label}
                                                    className="pr-10 text-sm"
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
                                                        <EyeOff className="h-3.5 w-3.5" />
                                                    ) : (
                                                        <Eye className="h-3.5 w-3.5" />
                                                    )}
                                                </Button>
                                            </div>
                                        ) : (
                                            <Input
                                                type={field.type === 'url' ? 'url' : 'text'}
                                                value={credentials[field.key] ?? ''}
                                                onChange={(e) =>
                                                    setCredentials((prev) => ({
                                                        ...prev,
                                                        [field.key]: e.target.value,
                                                    }))
                                                }
                                                placeholder={field.placeholder || field.label}
                                                className="text-sm"
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

                        {/* Config Fields */}
                        {configFields.length > 0 && (
                            <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Configuration
                                </h4>
                                {configFields.map((field) => (
                                    <div key={field.key} className="space-y-1.5">
                                        <Label className="text-xs font-medium">
                                            {field.label}
                                            {field.required && (
                                                <span className="text-destructive ml-0.5">*</span>
                                            )}
                                        </Label>
                                        {field.type === 'boolean' ? (
                                            <Switch
                                                checked={config[field.key] === true || config[field.key] === 'true'}
                                                onCheckedChange={(checked) =>
                                                    setConfig((prev) => ({
                                                        ...prev,
                                                        [field.key]: checked,
                                                    }))
                                                }
                                            />
                                        ) : field.type === 'password' ? (
                                            <div className="relative">
                                                <Input
                                                    type={showFields[`cfg_${field.key}`] ? 'text' : 'password'}
                                                    value={config[field.key] ?? ''}
                                                    onChange={(e) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            [field.key]: e.target.value,
                                                        }))
                                                    }
                                                    placeholder={field.placeholder || field.label}
                                                    className="pr-10 text-sm"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="absolute right-0 top-0 h-full px-3"
                                                    onClick={() =>
                                                        setShowFields((prev) => ({
                                                            ...prev,
                                                            [`cfg_${field.key}`]: !prev[`cfg_${field.key}`],
                                                        }))
                                                    }
                                                >
                                                    {showFields[`cfg_${field.key}`] ? (
                                                        <EyeOff className="h-3.5 w-3.5" />
                                                    ) : (
                                                        <Eye className="h-3.5 w-3.5" />
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
                                                className="text-sm"
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

                        {/* External Account Name */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Account Name (optional)</Label>
                            <Input
                                type="text"
                                value={externalName}
                                onChange={(e) => setExternalName(e.target.value)}
                                placeholder="e.g. My Brand Account"
                                className="text-sm"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                A friendly label for this connection
                            </p>
                        </div>
                    </div>

                    {/* Right: Test Chat */}
                    <div className="w-[400px] shrink-0 flex flex-col min-h-0">
                        <IntegrationTestChat
                            integrationName={definition.name}
                            connectionId={connection?.id}
                            testConversationId={connection?.test_conversation_id}
                            className="flex-1 min-h-[300px]"
                        />
                    </div>
                </div>

                <DialogFooter className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {isConnected && onDisconnect && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                onClick={onDisconnect}
                            >
                                Disconnect
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                            <Save className="w-3 h-3 mr-1.5" />
                            {isConnected ? 'Update' : 'Save & Connect'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
