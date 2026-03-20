'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Loader2, Plus, Trash2, Copy, CheckCircle, XCircle, Key, Calendar, Clock,
} from 'lucide-react'
import { getApiKeys, createApiKey, deleteApiKey } from './actions'
import { toast } from 'sonner'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

interface ApiKey {
    id: string
    name: string
    key_prefix: string
    scopes: string[]
    last_used_at: string | null
    expires_at: string | null
    created_at: string
}

const AVAILABLE_SCOPES = [
    { id: 'boards:read', label: 'Read boards', description: 'View boards and their steps' },
    { id: 'boards:write', label: 'Write boards', description: 'Create, update, and delete boards' },
    { id: 'tasks:read', label: 'Read tasks', description: 'View tasks and their details' },
    { id: 'tasks:write', label: 'Write tasks', description: 'Create, update, and delete tasks' },
    { id: 'conversations:read', label: 'Read conversations', description: 'View conversations and messages' },
    { id: 'conversations:write', label: 'Write conversations', description: 'Create conversations and send messages' },
    { id: 'skills:read', label: 'Read skills', description: 'View skills and categories' },
    { id: 'integrations:read', label: 'Read integrations', description: 'View integration definitions' },
    { id: 'integrations:write', label: 'Write integrations', description: 'Trigger syncs and manage integrations' },
    { id: 'account:read', label: 'Read account', description: 'View account details and members' },
]

// ============================================================================
// Main Page
// ============================================================================

export default function ApiKeysSettingsPage() {
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [createdKey, setCreatedKey] = useState<{ key: string; name: string } | null>(null)
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const loadApiKeys = useCallback(async () => {
        setLoading(true)
        const data = await getApiKeys()
        setApiKeys(data)
        setLoading(false)
    }, [])

    useEffect(() => { loadApiKeys() }, [loadApiKeys])

    const handleKeyCreated = (data: { key: string; name: string }) => {
        setCreatedKey(data)
        setShowCreateDialog(false)
        loadApiKeys()
    }

    const requestDelete = (keyId: string) => {
        setDeleteTarget(keyId)
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const result = await deleteApiKey(deleteTarget)
            if (result.error) {
                toast.error(result.error)
            } else {
                setDeleteTarget(null)
                setDeletingId(deleteTarget)
                setTimeout(() => {
                    setApiKeys((prev) => prev.filter((k) => k.id !== deleteTarget))
                    setDeletingId(null)
                    toast.success('API key revoked')
                }, 500)
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to revoke API key')
        } finally {
            setDeleteLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        )
    }

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-2">
                <h1 className="text-3xl font-bold">API Keys</h1>
                <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create API Key
                </Button>
            </div>
            <p className="text-muted-foreground mb-6">
                Create API keys to authenticate external services and agents with TaskClaw.
            </p>

            {alert && (
                <Alert className={`mb-6 ${alert.type === 'success'
                    ? 'bg-green-50 text-green-900 border-green-200 dark:bg-green-950 dark:text-green-100 dark:border-green-800'
                    : 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800'
                    }`}>
                    {alert.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    <AlertDescription>{alert.message}</AlertDescription>
                </Alert>
            )}

            {/* API Keys List */}
            <div className="space-y-3">
                {apiKeys.map((key) => (
                    <ApiKeyCard
                        key={key.id}
                        apiKey={key}
                        isAnimatingDelete={deletingId === key.id}
                        onDelete={() => requestDelete(key.id)}
                    />
                ))}
            </div>

            {apiKeys.length === 0 && (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="text-4xl mb-4">🔑</div>
                        <h3 className="text-lg font-semibold mb-2">No API keys yet</h3>
                        <p className="text-muted-foreground mb-4">
                            Create an API key to allow external services and agents to access TaskClaw.
                        </p>
                        <Button onClick={() => setShowCreateDialog(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create First API Key
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Create Dialog */}
            <CreateApiKeyDialog
                open={showCreateDialog}
                onOpenChange={(open) => {
                    if (!open) setShowCreateDialog(false)
                }}
                onKeyCreated={handleKeyCreated}
            />

            {/* Show Key Once Dialog */}
            <ShowKeyDialog
                apiKey={createdKey}
                open={!!createdKey}
                onOpenChange={(open) => {
                    if (!open) setCreatedKey(null)
                }}
            />

            <ConfirmDeleteDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={confirmDelete}
                title="Revoke API key?"
                description="This API key will be immediately invalidated and cannot be recovered. Any services using this key will lose access."
                loading={deleteLoading}
            />
        </div>
    )
}

// ============================================================================
// API Key Card
// ============================================================================

function ApiKeyCard({
    apiKey, isAnimatingDelete, onDelete,
}: {
    apiKey: ApiKey
    isAnimatingDelete: boolean
    onDelete: () => void
}) {
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Never'
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
    }

    const isExpired = apiKey.expires_at && new Date(apiKey.expires_at) < new Date()

    return (
        <Card className={cn(isAnimatingDelete && 'animate-deleting', isExpired && 'opacity-60')}>
            <CardContent className="py-4">
                <div className="flex items-center gap-4">
                    <div className="shrink-0">
                        <Key className="h-5 w-5 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-base">{apiKey.name}</h3>
                            {isExpired && (
                                <Badge variant="destructive" className="text-xs">
                                    Expired
                                </Badge>
                            )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                            <span className="font-mono">{apiKey.key_prefix}...</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Created {formatDate(apiKey.created_at)}
                            </span>
                            {apiKey.last_used_at && (
                                <>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        Last used {formatDate(apiKey.last_used_at)}
                                    </span>
                                </>
                            )}
                            {apiKey.expires_at && (
                                <>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                        Expires {formatDate(apiKey.expires_at)}
                                    </span>
                                </>
                            )}
                        </div>

                        {apiKey.scopes.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                {apiKey.scopes.map((scope) => (
                                    <Badge key={scope} variant="secondary" className="text-[10px] px-1.5 py-0">
                                        {scope}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                            onClick={onDelete}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

// ============================================================================
// Create API Key Dialog
// ============================================================================

function CreateApiKeyDialog({ open, onOpenChange, onKeyCreated }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onKeyCreated: (data: { key: string; name: string }) => void
}) {
    const [name, setName] = useState('')
    const [selectedScopes, setSelectedScopes] = useState<string[]>([])
    const [expiresAt, setExpiresAt] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            setName('')
            setSelectedScopes([])
            setExpiresAt('')
            setError(null)
        }
    }, [open])

    const handleScopeToggle = (scopeId: string) => {
        setSelectedScopes((prev) =>
            prev.includes(scopeId)
                ? prev.filter((s) => s !== scopeId)
                : [...prev, scopeId]
        )
    }

    const handleSave = async () => {
        if (!name.trim()) {
            setError('Name is required')
            return
        }

        setSaving(true)
        setError(null)

        const data: { name: string; scopes?: string[]; expires_at?: string | null } = {
            name: name.trim(),
        }

        if (selectedScopes.length > 0) {
            data.scopes = selectedScopes
        }

        if (expiresAt) {
            data.expires_at = new Date(expiresAt).toISOString()
        }

        const result = await createApiKey(data)

        if (result.error) {
            setError(result.error)
            setSaving(false)
            return
        }

        onKeyCreated({ key: result.key, name: data.name })
        setSaving(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create API Key</DialogTitle>
                    <DialogDescription>
                        Create a new API key to authenticate external services. The key will only be shown once.
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <Alert className="bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                            placeholder="e.g. MCP Server, Production API"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Scopes (optional)</Label>
                        <p className="text-xs text-muted-foreground">
                            Select the permissions this key should have. Leave empty for full access.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            {AVAILABLE_SCOPES.map((scope) => (
                                <div key={scope.id} className="flex items-start gap-2 p-2 rounded-lg border bg-accent/30">
                                    <Checkbox
                                        id={scope.id}
                                        checked={selectedScopes.includes(scope.id)}
                                        onCheckedChange={() => handleScopeToggle(scope.id)}
                                    />
                                    <div className="flex-1">
                                        <Label
                                            htmlFor={scope.id}
                                            className="text-xs font-medium cursor-pointer"
                                        >
                                            {scope.label}
                                        </Label>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            {scope.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Expiration Date (optional)</Label>
                        <Input
                            type="date"
                            value={expiresAt}
                            onChange={(e) => setExpiresAt(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                        />
                        <p className="text-xs text-muted-foreground">
                            Leave empty for no expiration. The key will automatically be invalidated after this date.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Create API Key
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================================
// Show Key Once Dialog
// ============================================================================

function ShowKeyDialog({ apiKey, open, onOpenChange }: {
    apiKey: { key: string; name: string } | null
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        if (apiKey?.key) {
            navigator.clipboard.writeText(apiKey.key)
            setCopied(true)
            toast.success('API key copied to clipboard')
            setTimeout(() => setCopied(false), 2000)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>API Key Created</DialogTitle>
                    <DialogDescription>
                        Save this API key now. It will only be shown once and cannot be retrieved later.
                    </DialogDescription>
                </DialogHeader>

                <Alert className="bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                        This is the only time you will see this key. Store it securely.
                    </AlertDescription>
                </Alert>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Key Name</Label>
                        <div className="px-3 py-2 rounded-md bg-accent text-sm font-medium">
                            {apiKey?.name}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>API Key</Label>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 px-3 py-2 rounded-md bg-accent font-mono text-sm break-all">
                                {apiKey?.key}
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleCopy}
                                className="shrink-0"
                            >
                                {copied ? (
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                    <Copy className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>
                        I&apos;ve saved this key
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
