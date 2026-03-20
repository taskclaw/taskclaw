'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Loader2, Plus, RefreshCw, Trash2, CheckCircle, XCircle,
    Clock, AlertTriangle, Filter,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { cn } from '@/lib/utils'
import {
    getSources, createSource, deleteSource, triggerSync,
    listNotionDatabases, listClickUpWorkspaces,
    getCategories,
} from './actions'
import {
    getDefinitionsByCategory,
    createConnection,
    updateConnection,
} from './integration-actions'
import { getAiProviderConfig } from '../ai-provider/actions'
import { CommToolsSection } from '@/components/settings/comm-tools-section'
import { IntegrationManager } from '@/components/integrations/integration-manager'
import { IntegrationSetupDialog } from '@/components/integrations/integration-setup-dialog'
import type { IntegrationDefinition, IntegrationConnection } from '@/types/integration'

// ============================================================================
// Types
// ============================================================================

interface Source {
    id: string
    provider: string
    config: Record<string, any>
    category_id: string
    sync_status: string
    last_synced_at: string | null
    last_sync_error: string | null
    is_active: boolean
    sync_interval_minutes: number
    categories: { id: string; name: string; color: string; icon?: string }
}

interface Category {
    id: string
    name: string
    color: string
}

interface NotionDatabase {
    id: string
    title: string
    icon: string | null
    url: string
}

interface ClickUpList {
    list_id: string
    list_name: string
    space_name: string
    folder_name: string | null
    team_name: string
    team_id: string
    task_count: number
}

type Provider = 'notion' | 'clickup'

const PROVIDERS: { id: Provider; name: string; description: string; icon: string; color: string }[] = [
    {
        id: 'notion',
        name: 'Notion',
        description: 'Sync tasks from your Notion databases',
        icon: '📝',
        color: '#000000',
    },
    {
        id: 'clickup',
        name: 'ClickUp',
        description: 'Sync tasks from your ClickUp lists',
        icon: '⚡',
        color: '#7B68EE',
    },
]

// ============================================================================
// Main Page
// ============================================================================

export default function IntegrationsPage() {
    const [sources, setSources] = useState<Source[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [showAddDialog, setShowAddDialog] = useState(false)
    const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
    const [openClawConnected, setOpenClawConnected] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        const [srcData, catData, aiConfig] = await Promise.all([
            getSources(),
            getCategories(),
            getAiProviderConfig(),
        ])
        setSources(srcData)
        setCategories(catData)
        setOpenClawConnected(!!aiConfig?.verified_at)
        setLoading(false)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    const handleSync = async (sourceId: string) => {
        setSyncingSourceId(sourceId)
        setAlert(null)
        try {
            const result = await triggerSync(sourceId)
            if (result.error) {
                setAlert({ type: 'error', message: result.error })
            } else {
                setAlert({
                    type: 'success',
                    message: `Synced ${result.tasks_synced} tasks (${result.tasks_created} new, ${result.tasks_updated} updated)`,
                })
                loadData()
            }
        } catch (e: any) {
            setAlert({ type: 'error', message: e.message })
        } finally {
            setSyncingSourceId(null)
        }
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const result = await deleteSource(deleteTarget)
            if (result.error) {
                toast.error(result.error)
            } else {
                setDeleteTarget(null)
                setDeletingId(deleteTarget)
                setTimeout(() => {
                    setDeletingId(null)
                    toast.success('Integration removed.')
                    loadData()
                }, 500)
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to remove integration')
        } finally {
            setDeleteLoading(false)
        }
    }

    const handleSourceCreated = () => {
        setShowAddDialog(false)
        loadData()
        setAlert({ type: 'success', message: 'Integration connected successfully!' })
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
                <h1 className="text-3xl font-bold">Integrations</h1>
            </div>
            <p className="text-muted-foreground mb-6">
                Connect external services and tools to power your AI workflows.
            </p>

            {/* ── Integration Marketplace (new system) ── */}
            <div className="mb-10">
                <h2 className="text-lg font-semibold mb-4">Integration Marketplace</h2>
                <IntegrationManager mode="settings" embedded excludeCategories={['communication', 'source']} />
            </div>

            {alert && (
                <Alert className={`mb-6 ${alert.type === 'success'
                    ? 'bg-green-50 text-green-900 border-green-200 dark:bg-green-950 dark:text-green-100 dark:border-green-800'
                    : 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800'
                }`}>
                    {alert.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    <AlertDescription>{alert.message}</AlertDescription>
                </Alert>
            )}

            {/* ── Task Sources (existing Notion/ClickUp sync) ── */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-semibold">Task Sources</h2>
                        <p className="text-sm text-muted-foreground">
                            Sync tasks from external project management tools.
                        </p>
                    </div>
                    <Button variant="outline" onClick={() => setShowAddDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Source
                    </Button>
                </div>

                {sources.length > 0 ? (
                    <div className="space-y-4">
                        {sources.map((source) => (
                            <SourceCard
                                key={source.id}
                                source={source}
                                syncing={syncingSourceId === source.id}
                                isAnimatingDelete={deletingId === source.id}
                                onSync={() => handleSync(source.id)}
                                onDelete={() => setDeleteTarget(source.id)}
                            />
                        ))}
                    </div>
                ) : (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="text-3xl mb-3">📝</div>
                            <h3 className="text-sm font-semibold mb-1">No task sources connected</h3>
                            <p className="text-xs text-muted-foreground mb-3">
                                Connect Notion or ClickUp to sync tasks.
                            </p>
                            <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
                                <Plus className="h-3 w-3 mr-1.5" />
                                Add Source
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* ── Communication Tools ── */}
            <div className="mb-8">
                <h2 className="text-lg font-semibold mb-1">Communication Tools</h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Declare which communication tools are available in your OpenClaw instance.
                    The AI will check availability before attempting communication tasks.
                </p>
                <CommToolsSection openClawConnected={openClawConnected} />
            </div>

            {/* Add Source Dialog (existing) */}
            <AddSourceDialog
                open={showAddDialog}
                onOpenChange={setShowAddDialog}
                categories={categories}
                onCreated={handleSourceCreated}
            />

            <ConfirmDeleteDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={confirmDelete}
                title="Remove integration?"
                description="Synced tasks will remain but will no longer be updated."
                confirmLabel="Remove"
                loading={deleteLoading}
            />
        </div>
    )
}

// ============================================================================
// Source Card (existing — unchanged)
// ============================================================================

function SourceCard({ source, syncing, isAnimatingDelete, onSync, onDelete }: {
    source: Source
    syncing: boolean
    isAnimatingDelete: boolean
    onSync: () => void
    onDelete: () => void
}) {
    const provider = PROVIDERS.find((p) => p.id === source.provider)
    const lastSynced = source.last_synced_at
        ? new Date(source.last_synced_at).toLocaleString()
        : 'Never'

    return (
        <Card className={cn(isAnimatingDelete && 'animate-deleting')}>
            <CardContent className="flex items-center gap-4 py-4">
                <div className="text-3xl">{provider?.icon || '🔗'}</div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{provider?.name || source.provider}</h3>
                        <Badge
                            variant="secondary"
                            className="text-xs"
                            style={{ backgroundColor: source.categories?.color + '20', color: source.categories?.color }}
                        >
                            {source.categories?.name || 'Unknown'}
                        </Badge>
                        <SyncStatusBadge status={source.sync_status} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last synced: {lastSynced}
                        </span>
                        <span>Every {source.sync_interval_minutes}m</span>
                        {source.config?.database_id && (
                            <span className="truncate max-w-48" title={source.config.database_id}>
                                DB: {source.config.database_id?.slice(0, 8)}...
                            </span>
                        )}
                        {source.config?.list_id && (
                            <span>List: {source.config.list_id}</span>
                        )}
                    </div>
                    {source.last_sync_error && (
                        <div className="flex items-center gap-1 text-xs text-red-500 mt-1">
                            <AlertTriangle className="h-3 w-3" />
                            {source.last_sync_error}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/dashboard/settings/categories">
                        <Button variant="outline" size="sm" title="Configure filters & category mapping">
                            <Filter className="h-4 w-4" />
                        </Button>
                    </Link>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onSync}
                        disabled={syncing}
                    >
                        {syncing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4" />
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onDelete}
                        disabled={isAnimatingDelete}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

function SyncStatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; className: string }> = {
        idle: { label: 'Active', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
        syncing: { label: 'Syncing...', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
        error: { label: 'Error', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
        disabled: { label: 'Disabled', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    }
    const s = map[status] || map.idle
    return <Badge variant="secondary" className={`text-xs ${s.className}`}>{s.label}</Badge>
}

// ============================================================================
// Add Source Wizard Dialog (unified — uses IntegrationSetupDialog for credentials)
// ============================================================================

function AddSourceDialog({ open, onOpenChange, categories, onCreated }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    categories: Category[]
    onCreated: () => void
}) {
    const [step, setStep] = useState<'provider' | 'setup' | 'database' | 'category'>('provider')
    const [provider, setProvider] = useState<Provider | null>(null)
    const [saving, setSaving] = useState(false)
    const [savingSetup, setSavingSetup] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Integration connection created via IntegrationSetupDialog
    const [sourceDefinitions, setSourceDefinitions] = useState<IntegrationDefinition[]>([])
    const [selectedDefinition, setSelectedDefinition] = useState<IntegrationDefinition | null>(null)
    const [createdConnection, setCreatedConnection] = useState<IntegrationConnection | null>(null)

    // Notion state
    const [notionDatabases, setNotionDatabases] = useState<NotionDatabase[]>([])
    const [selectedNotionDb, setSelectedNotionDb] = useState<string>('')
    const [loadingDbs, setLoadingDbs] = useState(false)

    // ClickUp state
    const [clickupLists, setClickupLists] = useState<ClickUpList[]>([])
    const [selectedClickupOrg, setSelectedClickupOrg] = useState<string>('')
    const [selectedClickupList, setSelectedClickupList] = useState<string>('')
    const [loadingLists, setLoadingLists] = useState(false)

    // Shared
    const [selectedCategory, setSelectedCategory] = useState<string>('')
    const [syncInterval, setSyncInterval] = useState(5)

    // Load source definitions on mount
    useEffect(() => {
        if (open) {
            getDefinitionsByCategory('source').then(setSourceDefinitions)
        }
    }, [open])

    useEffect(() => {
        if (open) {
            setStep('provider')
            setProvider(null)
            setSelectedDefinition(null)
            setCreatedConnection(null)
            setNotionDatabases([])
            setSelectedNotionDb('')
            setClickupLists([])
            setSelectedClickupOrg('')
            setSelectedClickupList('')
            setSelectedCategory('')
            setSyncInterval(5)
            setError(null)
        }
    }, [open])

    // Map provider id to definition slug
    const PROVIDER_SLUG_MAP: Record<Provider, string> = {
        notion: 'notion-source',
        clickup: 'clickup-source',
    }

    const handleProviderSelect = (p: Provider) => {
        setProvider(p)
        const slug = PROVIDER_SLUG_MAP[p]
        const def = sourceDefinitions.find((d) => d.slug === slug)
        if (def) {
            setSelectedDefinition(def)
            setStep('setup')
        } else {
            setError(`No integration definition found for ${p}. Please try again.`)
        }
    }

    // Called when IntegrationSetupDialog saves credentials
    const handleSetupSave = async (
        credentials: Record<string, string>,
        config: Record<string, any>,
        externalName?: string,
    ) => {
        if (!selectedDefinition) return
        setSavingSetup(true)
        setError(null)

        try {
            // Create or update the connection
            let conn: IntegrationConnection | null = createdConnection

            if (conn) {
                const result = await updateConnection(conn.id, {
                    credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
                    config,
                    external_account_name: externalName,
                })
                if (result.error) { setError(result.error); return }
                conn = result.data ?? conn
            } else {
                const result = await createConnection({
                    definition_id: selectedDefinition.id,
                    credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
                    config,
                    external_account_name: externalName,
                })
                if (result.error) { setError(result.error); return }
                conn = result.data ?? null
            }

            if (!conn) { setError('Failed to create connection'); return }
            setCreatedConnection(conn)

            // Now fetch databases/lists using the credentials that were just saved
            // We need the raw credential values for the provider-specific discovery APIs
            if (provider === 'notion') {
                const apiKey = credentials.api_key
                if (!apiKey || apiKey.includes('••')) {
                    // Already saved but masked — just advance to database step
                    setStep('database')
                    return
                }
                setLoadingDbs(true)
                try {
                    const dbs = await listNotionDatabases(apiKey)
                    if (dbs.error) { setError(dbs.error); return }
                    setNotionDatabases(dbs)
                } catch (e: any) {
                    setError(e.message); return
                } finally {
                    setLoadingDbs(false)
                }
            } else if (provider === 'clickup') {
                const apiToken = credentials.api_token
                if (!apiToken || apiToken.includes('••')) {
                    setStep('database')
                    return
                }
                setLoadingLists(true)
                try {
                    const lists = await listClickUpWorkspaces(apiToken)
                    if (lists.error) { setError(lists.error); return }
                    setClickupLists(lists)
                } catch (e: any) {
                    setError(e.message); return
                } finally {
                    setLoadingLists(false)
                }
            }

            setStep('database')
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSavingSetup(false)
        }
    }

    const handleDatabaseNext = () => {
        if (provider === 'notion' && !selectedNotionDb) { setError('Select a database'); return }
        if (provider === 'clickup' && !selectedClickupList) { setError('Select a list'); return }
        setError(null)
        setStep('category')
    }

    const handleCreate = async () => {
        if (!selectedCategory) { setError('Select a category'); return }
        if (!createdConnection) { setError('No connection found. Go back and enter credentials.'); return }
        setError(null)
        setSaving(true)

        try {
            let config: Record<string, any> = {}

            if (provider === 'notion') {
                config = {
                    database_id: selectedNotionDb,
                    data_source_id: selectedNotionDb,
                }
            } else if (provider === 'clickup') {
                config = {
                    list_id: selectedClickupList,
                }
            }

            const result = await createSource({
                provider: provider!,
                category_id: selectedCategory,
                config,
                sync_interval_minutes: syncInterval,
                connection_id: createdConnection.id,
            })

            if (result.error) {
                setError(result.error)
            } else {
                onCreated()
            }
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    // Step: provider selection
    if (step === 'provider') {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Choose an Integration</DialogTitle>
                        <DialogDescription>Select a tool to connect</DialogDescription>
                    </DialogHeader>

                    {error && (
                        <Alert className="bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800">
                            <XCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-3 py-2">
                        {PROVIDERS.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => handleProviderSelect(p.id)}
                                className="w-full flex items-center gap-4 p-4 rounded-lg border hover:border-primary hover:bg-accent transition-colors text-left"
                            >
                                <span className="text-3xl">{p.icon}</span>
                                <div>
                                    <h3 className="font-semibold">{p.name}</h3>
                                    <p className="text-sm text-muted-foreground">{p.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        )
    }

    // Step: IntegrationSetupDialog for credentials + test chat
    if (step === 'setup' && selectedDefinition) {
        return (
            <IntegrationSetupDialog
                definition={selectedDefinition}
                connection={createdConnection}
                open={open}
                onOpenChange={onOpenChange}
                onSave={handleSetupSave}
                saving={savingSetup}
            />
        )
    }

    // Steps: database and category use the same Dialog shell
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {step === 'database'
                            ? (provider === 'notion' ? 'Select Database' : 'Select List')
                            : 'Assign Category'
                        }
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'database'
                            ? (provider === 'notion' ? 'Choose which Notion database to sync' : 'Choose which ClickUp list to sync')
                            : 'Choose which category to assign synced tasks to'
                        }
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <Alert className="bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {step === 'database' && (
                    <div className="space-y-4 py-2">
                        {(loadingDbs || loadingLists) && (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        )}

                        {!loadingDbs && provider === 'notion' && (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {notionDatabases.length === 0 && (
                                    <p className="text-sm text-muted-foreground py-4 text-center">
                                        No databases found. Make sure you shared your database with the integration.
                                    </p>
                                )}
                                {notionDatabases.map((db) => (
                                    <button
                                        key={db.id}
                                        onClick={() => setSelectedNotionDb(db.id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                                            selectedNotionDb === db.id
                                                ? 'border-primary bg-primary/5'
                                                : 'hover:border-muted-foreground/30 hover:bg-accent'
                                        }`}
                                    >
                                        <span className="text-xl">{db.icon || '📄'}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{db.title}</p>
                                            <p className="text-xs text-muted-foreground truncate">{db.id}</p>
                                        </div>
                                        {selectedNotionDb === db.id && (
                                            <CheckCircle className="h-5 w-5 text-primary" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {!loadingLists && provider === 'clickup' && (() => {
                            const orgs = Array.from(
                                new Map(clickupLists.map((l) => [l.team_id, { id: l.team_id, name: l.team_name }])).values()
                            )
                            const filteredLists = selectedClickupOrg
                                ? clickupLists.filter((l) => l.team_id === selectedClickupOrg)
                                : []
                            const grouped = filteredLists.reduce<Record<string, ClickUpList[]>>((acc, l) => {
                                const key = l.folder_name
                                    ? `${l.space_name} \u2192 ${l.folder_name}`
                                    : l.space_name
                                if (!acc[key]) acc[key] = []
                                acc[key].push(l)
                                return acc
                            }, {})

                            return (
                                <div className="space-y-4">
                                    {clickupLists.length === 0 ? (
                                        <p className="text-sm text-muted-foreground py-4 text-center">
                                            No lists found. Check your API token permissions.
                                        </p>
                                    ) : (
                                        <>
                                            <div className="space-y-2">
                                                <Label>Organization</Label>
                                                <Select
                                                    value={selectedClickupOrg}
                                                    onValueChange={(v) => {
                                                        setSelectedClickupOrg(v)
                                                        setSelectedClickupList('')
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select an organization..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {orgs.map((org) => (
                                                            <SelectItem key={org.id} value={org.id}>
                                                                {org.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {selectedClickupOrg && (
                                                <div className="space-y-2">
                                                    <Label>List</Label>
                                                    <Select
                                                        value={selectedClickupList}
                                                        onValueChange={setSelectedClickupList}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select a list..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {Object.entries(grouped).map(([group, lists]) => (
                                                                <div key={group}>
                                                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                                                        {group}
                                                                    </div>
                                                                    {lists.map((list) => (
                                                                        <SelectItem key={list.list_id} value={list.list_id}>
                                                                            <div className="flex items-center justify-between w-full gap-3">
                                                                                <span>{list.list_name}</span>
                                                                                {list.task_count > 0 && (
                                                                                    <span className="text-xs text-muted-foreground ml-2">
                                                                                        {list.task_count} tasks
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </SelectItem>
                                                                    ))}
                                                                </div>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>

                                                    {filteredLists.length === 0 && (
                                                        <p className="text-xs text-muted-foreground">
                                                            No lists found in this organization.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )
                        })()}

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setStep('setup')}>Back</Button>
                            <Button onClick={handleDatabaseNext}>Next</Button>
                        </DialogFooter>
                    </div>
                )}

                {step === 'category' && (
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Default Agent</Label>
                            <p className="text-xs text-muted-foreground mb-2">
                                Synced tasks will be assigned to this agent. Tasks with matching agent metadata from the source will be auto-mapped.
                            </p>
                            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a category..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: cat.color }}
                                                />
                                                {cat.name}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Sync Interval (minutes)</Label>
                            <Select value={String(syncInterval)} onValueChange={(v) => setSyncInterval(Number(v))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="5">Every 5 minutes</SelectItem>
                                    <SelectItem value="15">Every 15 minutes</SelectItem>
                                    <SelectItem value="30">Every 30 minutes</SelectItem>
                                    <SelectItem value="60">Every hour</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setStep('database')}>Back</Button>
                            <Button onClick={handleCreate} disabled={saving}>
                                {saving ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...</>
                                ) : (
                                    'Connect Integration'
                                )}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
