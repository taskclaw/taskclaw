'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Download, GripVertical } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type {
    IntegrationAuthType,
    IntegrationAuthKeyField,
    CreateDefinitionPayload,
} from '@/types/integration'

interface IntegrationCreateDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSave: (payload: CreateDefinitionPayload) => Promise<void>
    saving?: boolean
}

const AUTH_TYPE_OPTIONS: { value: IntegrationAuthType; label: string; description: string }[] = [
    { value: 'api_key', label: 'API Key', description: 'Authenticate with static API keys or tokens' },
    { value: 'oauth2', label: 'OAuth 2.0', description: 'Redirect-based authentication flow' },
    { value: 'webhook', label: 'Webhook', description: 'Incoming/outgoing webhook URLs' },
    { value: 'basic', label: 'Basic Auth', description: 'Username and password authentication' },
    { value: 'none', label: 'None', description: 'No authentication required' },
]

const EMPTY_FIELD: IntegrationAuthKeyField = {
    key: '',
    label: '',
    type: 'password',
    required: true,
    placeholder: '',
    help_text: '',
}

export function IntegrationCreateDialog({
    open,
    onOpenChange,
    onSave,
    saving,
}: IntegrationCreateDialogProps) {
    // Basic info
    const [name, setName] = useState('')
    const [slug, setSlug] = useState('')
    const [description, setDescription] = useState('')
    const [icon, setIcon] = useState('')
    const [categories, setCategories] = useState('')

    // Auth
    const [authType, setAuthType] = useState<IntegrationAuthType>('api_key')
    const [keyFields, setKeyFields] = useState<IntegrationAuthKeyField[]>([{ ...EMPTY_FIELD }])

    // OAuth specific
    const [oauthAuthUrl, setOauthAuthUrl] = useState('')
    const [oauthTokenUrl, setOauthTokenUrl] = useState('')
    const [oauthScopes, setOauthScopes] = useState('')
    const [oauthPkce, setOauthPkce] = useState(true)

    // Setup & Skill
    const [setupGuide, setSetupGuide] = useState('')
    const [skillId, setSkillId] = useState('')

    // Auto-generate slug from name
    useEffect(() => {
        if (name && !slug) {
            setSlug(
                name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
            )
        }
    }, [name, slug])

    // Reset on open
    useEffect(() => {
        if (open) {
            setName('')
            setSlug('')
            setDescription('')
            setIcon('')
            setCategories('')
            setAuthType('api_key')
            setKeyFields([{ ...EMPTY_FIELD }])
            setOauthAuthUrl('')
            setOauthTokenUrl('')
            setOauthScopes('')
            setOauthPkce(true)
            setSetupGuide('')
            setSkillId('')
        }
    }, [open])

    const addField = () => {
        setKeyFields((prev) => [...prev, { ...EMPTY_FIELD }])
    }

    const removeField = (index: number) => {
        setKeyFields((prev) => prev.filter((_, i) => i !== index))
    }

    const updateField = (index: number, updates: Partial<IntegrationAuthKeyField>) => {
        setKeyFields((prev) =>
            prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
        )
    }

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error('Name is required')
            return
        }
        if (!slug.trim()) {
            toast.error('Slug is required')
            return
        }

        const payload: CreateDefinitionPayload = {
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim() || undefined,
            icon: icon.trim() || undefined,
            categories: categories
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean),
            auth_type: authType,
            setup_guide: setupGuide.trim() || undefined,
            skill_id: skillId.trim() || undefined,
        }

        if (authType === 'api_key' || authType === 'basic' || authType === 'webhook') {
            const validFields = keyFields.filter((f) => f.key.trim() && f.label.trim())
            payload.auth_config = { key_fields: validFields }
        } else if (authType === 'oauth2') {
            payload.auth_config = {
                authorization_url: oauthAuthUrl.trim(),
                token_url: oauthTokenUrl.trim(),
                default_scopes: oauthScopes
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                pkce: oauthPkce,
            }
        }

        try {
            await onSave(payload)
        } catch (err: any) {
            toast.error(err.message || 'Failed to create integration')
        }
    }

    const handleExport = () => {
        const payload: CreateDefinitionPayload = {
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim() || undefined,
            icon: icon.trim() || undefined,
            categories: categories
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean),
            auth_type: authType,
            setup_guide: setupGuide.trim() || undefined,
        }

        if (authType === 'api_key' || authType === 'basic' || authType === 'webhook') {
            payload.auth_config = { key_fields: keyFields.filter((f) => f.key && f.label) }
        } else if (authType === 'oauth2') {
            payload.auth_config = {
                authorization_url: oauthAuthUrl,
                token_url: oauthTokenUrl,
                default_scopes: oauthScopes.split(',').map((s) => s.trim()).filter(Boolean),
                pkce: oauthPkce,
            }
        }

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${slug || 'integration'}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-sm">Create Custom Integration</DialogTitle>
                    <DialogDescription className="text-xs">
                        Define a new integration that teaches AI how to use an external service.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-5 pr-1">
                    {/* Basic Info */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Basic Info
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Name *</Label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="My Integration"
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Slug *</Label>
                                <Input
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    placeholder="my-integration"
                                    className="text-sm font-mono"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Description</Label>
                            <Input
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="What does this integration do?"
                                className="text-sm"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Icon (emoji)</Label>
                                <Input
                                    value={icon}
                                    onChange={(e) => setIcon(e.target.value)}
                                    placeholder="🔌"
                                    className="text-sm"
                                    maxLength={4}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Categories (comma-separated)</Label>
                                <Input
                                    value={categories}
                                    onChange={(e) => setCategories(e.target.value)}
                                    placeholder="social, marketing"
                                    className="text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Auth Type */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Authentication
                        </h4>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Auth Type</Label>
                            <Select value={authType} onValueChange={(v) => setAuthType(v as IntegrationAuthType)}>
                                <SelectTrigger className="text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {AUTH_TYPE_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            <div>
                                                <span className="font-medium">{opt.label}</span>
                                                <span className="text-xs text-muted-foreground ml-2">
                                                    {opt.description}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* API Key / Basic / Webhook Fields */}
                        {(authType === 'api_key' || authType === 'basic' || authType === 'webhook') && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs">Credential Fields</Label>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-[10px]"
                                        onClick={addField}
                                    >
                                        <Plus className="w-3 h-3 mr-1" />
                                        Add Field
                                    </Button>
                                </div>
                                {keyFields.map((field, i) => (
                                    <div key={i} className="flex items-start gap-2 p-2 bg-accent/30 rounded-lg">
                                        <div className="flex-1 grid grid-cols-3 gap-2">
                                            <Input
                                                value={field.key}
                                                onChange={(e) => updateField(i, { key: e.target.value })}
                                                placeholder="key"
                                                className="text-xs font-mono h-8"
                                            />
                                            <Input
                                                value={field.label}
                                                onChange={(e) => updateField(i, { label: e.target.value })}
                                                placeholder="Label"
                                                className="text-xs h-8"
                                            />
                                            <Select
                                                value={field.type}
                                                onValueChange={(v) => updateField(i, { type: v as any })}
                                            >
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="password">Password</SelectItem>
                                                    <SelectItem value="text">Text</SelectItem>
                                                    <SelectItem value="url">URL</SelectItem>
                                                    <SelectItem value="number">Number</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex items-center gap-1 mt-1">
                                            <Switch
                                                checked={field.required}
                                                onCheckedChange={(v) => updateField(i, { required: v })}
                                                className="scale-75"
                                            />
                                            <span className="text-[10px] text-muted-foreground">Req</span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => removeField(i)}
                                            disabled={keyFields.length <= 1}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* OAuth2 Config */}
                        {authType === 'oauth2' && (
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Authorization URL</Label>
                                    <Input
                                        value={oauthAuthUrl}
                                        onChange={(e) => setOauthAuthUrl(e.target.value)}
                                        placeholder="https://provider.com/oauth/authorize"
                                        className="text-sm"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Token URL</Label>
                                    <Input
                                        value={oauthTokenUrl}
                                        onChange={(e) => setOauthTokenUrl(e.target.value)}
                                        placeholder="https://provider.com/oauth/token"
                                        className="text-sm"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Scopes (comma-separated)</Label>
                                    <Input
                                        value={oauthScopes}
                                        onChange={(e) => setOauthScopes(e.target.value)}
                                        placeholder="read, write, admin"
                                        className="text-sm"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch checked={oauthPkce} onCheckedChange={setOauthPkce} />
                                    <Label className="text-xs">PKCE (recommended)</Label>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Setup Guide */}
                    <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Setup Guide
                        </h4>
                        <Textarea
                            value={setupGuide}
                            onChange={(e) => setSetupGuide(e.target.value)}
                            placeholder="Step-by-step instructions for connecting this integration..."
                            rows={4}
                            className="text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Markdown supported. Shown to users when setting up this integration.
                        </p>
                    </div>

                    {/* Linked Skill */}
                    <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Linked Skill
                        </h4>
                        <Input
                            value={skillId}
                            onChange={(e) => setSkillId(e.target.value)}
                            placeholder="Skill UUID (optional)"
                            className="text-sm font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            The skill that teaches the AI how to use this integration's API.
                        </p>
                    </div>
                </div>

                <DialogFooter className="flex items-center justify-between">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        disabled={!name.trim() || !slug.trim()}
                    >
                        <Download className="w-3 h-3 mr-1.5" />
                        Export JSON
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={saving || !name.trim() || !slug.trim()}>
                            {saving && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                            Create Integration
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
