'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Loader2, Plus, Trash2, Pencil, CheckCircle, XCircle, Webhook, Clock, ExternalLink,
    AlertCircle, RotateCw, CheckCheck,
} from 'lucide-react'
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook, getDeliveries } from './actions'
import { toast } from 'sonner'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

interface Webhook {
    id: string
    url: string
    secret: string
    events: string[]
    active: boolean
    created_at: string
    last_delivery_at?: string | null
}

interface WebhookDelivery {
    id: string
    webhook_id: string
    event: string
    payload: Record<string, any>
    status: string
    response_code: number | null
    attempts: number
    next_retry_at: string | null
    created_at: string
}

const AVAILABLE_EVENTS = [
    { id: 'task.created', label: 'Task Created', description: 'When a new task is created' },
    { id: 'task.updated', label: 'Task Updated', description: 'When a task is modified' },
    { id: 'task.moved', label: 'Task Moved', description: 'When a task is moved to a different step' },
    { id: 'task.completed', label: 'Task Completed', description: 'When a task is marked as complete' },
    { id: 'task.deleted', label: 'Task Deleted', description: 'When a task is deleted' },
    { id: 'board.created', label: 'Board Created', description: 'When a new board is created' },
    { id: 'board.updated', label: 'Board Updated', description: 'When a board is modified' },
    { id: 'board.deleted', label: 'Board Deleted', description: 'When a board is deleted' },
    { id: 'conversation.created', label: 'Conversation Created', description: 'When a new conversation starts' },
    { id: 'message.created', label: 'Message Created', description: 'When a message is sent' },
    { id: 'sync.completed', label: 'Sync Completed', description: 'When a sync job completes' },
    { id: 'sync.failed', label: 'Sync Failed', description: 'When a sync job fails' },
]

// ============================================================================
// Main Page
// ============================================================================

export default function WebhooksSettingsPage() {
    const [webhooks, setWebhooks] = useState<Webhook[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null)
    const [viewingDeliveries, setViewingDeliveries] = useState<string | null>(null)
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const loadWebhooks = useCallback(async () => {
        setLoading(true)
        const data = await getWebhooks()
        setWebhooks(data)
        setLoading(false)
    }, [])

    useEffect(() => { loadWebhooks() }, [loadWebhooks])

    const handleWebhookSaved = () => {
        setShowCreateDialog(false)
        setEditingWebhook(null)
        loadWebhooks()
        setAlert({ type: 'success', message: editingWebhook ? 'Webhook updated.' : 'Webhook created.' })
    }

    const handleToggleActive = async (webhook: Webhook) => {
        const result = await updateWebhook(webhook.id, { active: !webhook.active })
        if (result.error) {
            setAlert({ type: 'error', message: result.error })
        } else {
            setWebhooks((prev) => prev.map((w) => w.id === webhook.id ? { ...w, active: !w.active } : w))
        }
    }

    const requestDelete = (webhookId: string) => {
        setDeleteTarget(webhookId)
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const result = await deleteWebhook(deleteTarget)
            if (result.error) {
                toast.error(result.error)
            } else {
                setDeleteTarget(null)
                setDeletingId(deleteTarget)
                setTimeout(() => {
                    setWebhooks((prev) => prev.filter((w) => w.id !== deleteTarget))
                    setDeletingId(null)
                    toast.success('Webhook deleted')
                }, 500)
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to delete webhook')
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
                <h1 className="text-3xl font-bold">Webhooks</h1>
                <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Webhook
                </Button>
            </div>
            <p className="text-muted-foreground mb-6">
                Configure webhooks to receive real-time event notifications from TaskClaw.
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

            {/* Webhooks List */}
            <div className="space-y-3">
                {webhooks.map((webhook) => (
                    <WebhookCard
                        key={webhook.id}
                        webhook={webhook}
                        isAnimatingDelete={deletingId === webhook.id}
                        onToggleActive={() => handleToggleActive(webhook)}
                        onEdit={() => setEditingWebhook(webhook)}
                        onDelete={() => requestDelete(webhook.id)}
                        onViewDeliveries={() => setViewingDeliveries(webhook.id)}
                    />
                ))}
            </div>

            {webhooks.length === 0 && (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="text-4xl mb-4">🪝</div>
                        <h3 className="text-lg font-semibold mb-2">No webhooks yet</h3>
                        <p className="text-muted-foreground mb-4">
                            Create a webhook to receive real-time notifications when events occur in TaskClaw.
                        </p>
                        <Button onClick={() => setShowCreateDialog(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create First Webhook
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Create/Edit Dialog */}
            <WebhookDialog
                open={showCreateDialog || editingWebhook !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowCreateDialog(false)
                        setEditingWebhook(null)
                    }
                }}
                webhook={editingWebhook}
                onSaved={handleWebhookSaved}
            />

            {/* Delivery History Dialog */}
            {viewingDeliveries && (
                <DeliveryHistoryDialog
                    webhookId={viewingDeliveries}
                    webhook={webhooks.find((w) => w.id === viewingDeliveries)!}
                    open={!!viewingDeliveries}
                    onOpenChange={(open) => {
                        if (!open) setViewingDeliveries(null)
                    }}
                />
            )}

            <ConfirmDeleteDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={confirmDelete}
                title="Delete webhook?"
                description="This webhook will stop receiving events immediately. This action cannot be undone."
                loading={deleteLoading}
            />
        </div>
    )
}

// ============================================================================
// Webhook Card
// ============================================================================

function WebhookCard({
    webhook, isAnimatingDelete, onToggleActive, onEdit, onDelete, onViewDeliveries,
}: {
    webhook: Webhook
    isAnimatingDelete: boolean
    onToggleActive: () => void
    onEdit: () => void
    onDelete: () => void
    onViewDeliveries: () => void
}) {
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Never'
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    return (
        <Card className={cn(!webhook.active && 'opacity-60', isAnimatingDelete && 'animate-deleting')}>
            <CardContent className="py-4">
                <div className="flex items-center gap-4">
                    <div className="shrink-0">
                        <Webhook className="h-5 w-5 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-base truncate">{webhook.url}</h3>
                            {!webhook.active && (
                                <Badge variant="secondary" className="text-xs">
                                    Inactive
                                </Badge>
                            )}
                            {webhook.active && (
                                <Badge className="text-xs bg-green-600/20 text-green-400 border-green-600/30">
                                    Active
                                </Badge>
                            )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                            <span>{webhook.events.length} event{webhook.events.length !== 1 ? 's' : ''}</span>
                            {webhook.last_delivery_at && (
                                <>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        Last delivery {formatDate(webhook.last_delivery_at)}
                                    </span>
                                </>
                            )}
                            <span>•</span>
                            <button
                                onClick={onViewDeliveries}
                                className="flex items-center gap-1 hover:text-foreground transition-colors"
                            >
                                <ExternalLink className="h-3 w-3" />
                                View deliveries
                            </button>
                        </div>

                        {webhook.events.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                {webhook.events.slice(0, 5).map((event) => (
                                    <Badge key={event} variant="secondary" className="text-[10px] px-1.5 py-0">
                                        {event}
                                    </Badge>
                                ))}
                                {webhook.events.length > 5 && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                        +{webhook.events.length - 5} more
                                    </Badge>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-2 mr-2">
                            <Label htmlFor={`active-${webhook.id}`} className="text-xs text-muted-foreground sr-only">
                                Active
                            </Label>
                            <Switch
                                id={`active-${webhook.id}`}
                                checked={webhook.active}
                                onCheckedChange={onToggleActive}
                            />
                        </div>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onEdit}>
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
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
// Create/Edit Webhook Dialog
// ============================================================================

function WebhookDialog({ open, onOpenChange, webhook, onSaved }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    webhook: Webhook | null
    onSaved: () => void
}) {
    const isEdit = !!webhook
    const [url, setUrl] = useState('')
    const [secret, setSecret] = useState('')
    const [selectedEvents, setSelectedEvents] = useState<string[]>([])
    const [active, setActive] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            setUrl(webhook?.url || '')
            setSecret(webhook?.secret || '')
            setSelectedEvents(webhook?.events || [])
            setActive(webhook?.active ?? true)
            setError(null)
        }
    }, [open, webhook])

    const handleEventToggle = (eventId: string) => {
        setSelectedEvents((prev) =>
            prev.includes(eventId)
                ? prev.filter((e) => e !== eventId)
                : [...prev, eventId]
        )
    }

    const handleSave = async () => {
        if (!url.trim()) {
            setError('URL is required')
            return
        }

        if (selectedEvents.length === 0) {
            setError('At least one event must be selected')
            return
        }

        try {
            new URL(url)
        } catch {
            setError('Invalid URL format')
            return
        }

        setSaving(true)
        setError(null)

        const data = {
            url: url.trim(),
            secret: secret.trim() || undefined,
            events: selectedEvents,
            active,
        }

        const result = isEdit
            ? await updateWebhook(webhook!.id, data)
            : await createWebhook(data)

        if (result.error) {
            setError(result.error)
            setSaving(false)
            return
        }

        onSaved()
        setSaving(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit Webhook' : 'Create Webhook'}</DialogTitle>
                    <DialogDescription>
                        {isEdit
                            ? 'Update webhook configuration and event subscriptions.'
                            : 'Configure a new webhook to receive event notifications via HTTP POST requests.'}
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
                        <Label>Webhook URL</Label>
                        <Input
                            placeholder="https://example.com/webhooks/taskclaw"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            The endpoint that will receive POST requests with event data.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Secret (optional)</Label>
                        <Input
                            type="password"
                            placeholder="Your webhook secret"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Used to generate HMAC-SHA256 signature for request verification. Recommended for security.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Events</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                            Select which events should trigger this webhook.
                        </p>
                        <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                            {AVAILABLE_EVENTS.map((event) => (
                                <div key={event.id} className="flex items-start gap-2 p-2 rounded-lg border bg-accent/30">
                                    <Checkbox
                                        id={event.id}
                                        checked={selectedEvents.includes(event.id)}
                                        onCheckedChange={() => handleEventToggle(event.id)}
                                    />
                                    <div className="flex-1">
                                        <Label
                                            htmlFor={event.id}
                                            className="text-xs font-medium cursor-pointer"
                                        >
                                            {event.label}
                                        </Label>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            {event.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch
                            id="webhook-active"
                            checked={active}
                            onCheckedChange={setActive}
                        />
                        <Label htmlFor="webhook-active" className="cursor-pointer">
                            Active (start receiving events immediately)
                        </Label>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {isEdit ? 'Save Changes' : 'Create Webhook'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================================
// Delivery History Dialog
// ============================================================================

function DeliveryHistoryDialog({ webhookId, webhook, open, onOpenChange }: {
    webhookId: string
    webhook: Webhook
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (open) {
            setLoading(true)
            getDeliveries(webhookId).then((data) => {
                setDeliveries(data)
                setLoading(false)
            })
        }
    }, [open, webhookId])

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
    }

    const getStatusBadge = (delivery: WebhookDelivery) => {
        if (delivery.status === 'success') {
            return (
                <Badge className="text-xs bg-green-600/20 text-green-400 border-green-600/30">
                    <CheckCheck className="h-3 w-3 mr-1" />
                    Success
                </Badge>
            )
        }
        if (delivery.status === 'pending' || delivery.status === 'retrying') {
            return (
                <Badge className="text-xs bg-blue-600/20 text-blue-400 border-blue-600/30">
                    <RotateCw className="h-3 w-3 mr-1" />
                    Retrying
                </Badge>
            )
        }
        return (
            <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Failed
            </Badge>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Delivery History</DialogTitle>
                    <DialogDescription>
                        Recent webhook deliveries for {webhook.url}
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">Loading deliveries...</span>
                    </div>
                ) : deliveries.length === 0 ? (
                    <div className="text-center py-12 border border-dashed rounded-lg bg-accent/30">
                        <Webhook className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                            No deliveries yet for this webhook
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {deliveries.map((delivery) => (
                            <Card key={delivery.id}>
                                <CardContent className="py-3">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant="outline" className="text-xs">
                                                    {delivery.event}
                                                </Badge>
                                                {getStatusBadge(delivery)}
                                                {delivery.response_code && (
                                                    <Badge variant="secondary" className="text-[10px]">
                                                        {delivery.response_code}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {formatDate(delivery.created_at)}
                                                </span>
                                                <span>•</span>
                                                <span>{delivery.attempts} attempt{delivery.attempts !== 1 ? 's' : ''}</span>
                                                {delivery.next_retry_at && (
                                                    <>
                                                        <span>•</span>
                                                        <span>Next retry: {formatDate(delivery.next_retry_at)}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
