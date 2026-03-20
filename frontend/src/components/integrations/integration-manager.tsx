'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, Plug } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { IntegrationCatalog } from './integration-catalog'
import { IntegrationConnectionCard } from './integration-connection-card'
import { IntegrationSetupDialog } from './integration-setup-dialog'
import { IntegrationCreateDialog } from './integration-create-dialog'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import {
    getIntegrationCatalog,
    getConnections,
    createConnection,
    updateConnection,
    deleteConnection,
    testConnection,
    createDefinition,
    initiateOAuth,
    getBoardIntegrationRefs,
    addBoardIntegrationRef,
    removeBoardIntegrationRef,
} from '@/app/dashboard/settings/integrations/integration-actions'
import type {
    IntegrationDefinition,
    IntegrationConnection,
    IntegrationCatalogItem,
    BoardIntegrationRef,
    CreateDefinitionPayload,
} from '@/types/integration'

interface IntegrationManagerProps {
    mode: 'settings' | 'board'
    boardId?: string
    onClose?: () => void
    /** If true, renders as a full-page embedded component (no dialog wrapper) */
    embedded?: boolean
    /** Dialog size: 'default' (max-w-4xl) or 'full' (near full-screen) */
    size?: 'default' | 'full'
    /** Filter out definitions that belong to any of these categories */
    excludeCategories?: string[]
}

export function IntegrationManager({ mode, boardId, onClose, embedded, size = 'default', excludeCategories }: IntegrationManagerProps) {
    const [loading, setLoading] = useState(true)
    const [catalogItems, setCatalogItems] = useState<IntegrationCatalogItem[]>([])
    const [connections, setConnections] = useState<IntegrationConnection[]>([])
    const [boardRefs, setBoardRefs] = useState<BoardIntegrationRef[]>([])
    const [boardConnectionIds, setBoardConnectionIds] = useState<Set<string>>(new Set())

    // Dialog states
    const [setupDef, setSetupDef] = useState<IntegrationDefinition | null>(null)
    const [setupConn, setSetupConn] = useState<IntegrationConnection | null>(null)
    const [showCreate, setShowCreate] = useState(false)
    const [disconnectTarget, setDisconnectTarget] = useState<IntegrationConnection | null>(null)

    // Loading states
    const [saving, setSaving] = useState(false)
    const [testingId, setTestingId] = useState<string | null>(null)
    const [disconnecting, setDisconnecting] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [catalog, conns] = await Promise.all([
                getIntegrationCatalog(),
                getConnections(),
            ])
            setCatalogItems(catalog)
            setConnections(conns)

            if (mode === 'board' && boardId) {
                const refs = await getBoardIntegrationRefs(boardId)
                setBoardRefs(refs)
                setBoardConnectionIds(new Set(refs.map((r) => r.connection_id)))
            }
        } catch (err) {
            console.error('[IntegrationManager] Failed to load data:', err)
        } finally {
            setLoading(false)
        }
    }, [mode, boardId])

    useEffect(() => {
        loadData()
    }, [loadData])

    // ─── Connect Flow ──────────────────────────────────────────────
    const handleConnect = (definition: IntegrationDefinition) => {
        setSetupDef(definition)
        setSetupConn(null)
    }

    const handleManage = (definition: IntegrationDefinition, connection: IntegrationConnection) => {
        setSetupDef(definition)
        setSetupConn(connection)
    }

    const handleSaveConnection = async (
        credentials: Record<string, string>,
        config: Record<string, any>,
        externalName?: string
    ) => {
        if (!setupDef) return
        setSaving(true)
        try {
            if (setupConn) {
                const result = await updateConnection(setupConn.id, {
                    credentials,
                    config,
                    external_account_name: externalName,
                })
                if (result.error) {
                    toast.error(result.error)
                    return
                }
                toast.success(`${setupDef.name} updated`)
            } else {
                const result = await createConnection({
                    definition_id: setupDef.id,
                    credentials,
                    config,
                    external_account_name: externalName,
                })
                if (result.error) {
                    toast.error(result.error)
                    return
                }
                toast.success(`${setupDef.name} connected`)
            }
            setSetupDef(null)
            setSetupConn(null)
            loadData()
        } finally {
            setSaving(false)
        }
    }

    const handleInitiateOAuth = async () => {
        if (!setupDef) return
        const result = await initiateOAuth(setupDef.id)
        if (result.error) {
            toast.error(result.error)
            return
        }
        if (result.redirect_url) {
            window.open(result.redirect_url, '_blank', 'width=600,height=700')
        }
    }

    // ─── Disconnect ──────────────────────────────────────────────
    const handleDisconnect = async () => {
        if (!disconnectTarget) return
        setDisconnecting(true)
        try {
            const result = await deleteConnection(disconnectTarget.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Integration disconnected')
                setDisconnectTarget(null)
                setSetupDef(null)
                setSetupConn(null)
                loadData()
            }
        } finally {
            setDisconnecting(false)
        }
    }

    // ─── Test ──────────────────────────────────────────────
    const handleTest = async (connection: IntegrationConnection) => {
        setTestingId(connection.id)
        try {
            const result = await testConnection(connection.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Connection test passed')
                loadData()
            }
        } finally {
            setTestingId(null)
        }
    }

    // ─── Board Refs ──────────────────────────────────────────────
    const handleToggleBoard = async (connection: IntegrationConnection, add: boolean) => {
        if (!boardId) return
        if (add) {
            const result = await addBoardIntegrationRef(boardId, connection.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`Added to board`)
                loadData()
            }
        } else {
            const ref = boardRefs.find((r) => r.connection_id === connection.id)
            if (ref) {
                const result = await removeBoardIntegrationRef(boardId, ref.id)
                if (result.error) {
                    toast.error(result.error)
                } else {
                    toast.success('Removed from board')
                    loadData()
                }
            }
        }
    }

    // ─── Create Custom ──────────────────────────────────────────────
    const handleCreateDefinition = async (payload: CreateDefinitionPayload) => {
        setSaving(true)
        try {
            const result = await createDefinition(payload)
            if (result.error) {
                toast.error(result.error)
                return
            }
            toast.success(`${payload.name} created`)
            setShowCreate(false)
            loadData()
        } finally {
            setSaving(false)
        }
    }

    // ─── Content ──────────────────────────────────────────────
    const content = (
        <>
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <Tabs defaultValue="catalog" className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-3">
                        <TabsList>
                            <TabsTrigger value="catalog" className="text-xs">
                                <Plug className="w-3.5 h-3.5 mr-1.5" />
                                Catalog
                            </TabsTrigger>
                            <TabsTrigger value="connections" className="text-xs">
                                My Connections
                                {connections.length > 0 && (
                                    <span className="ml-1.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                        {connections.length}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setShowCreate(true)}
                        >
                            <Plus className="w-3 h-3 mr-1" />
                            Custom
                        </Button>
                    </div>

                    <TabsContent value="catalog" className="flex-1 min-h-0 overflow-y-auto">
                        <IntegrationCatalog
                            items={catalogItems}
                            mode={mode}
                            boardConnectionIds={boardConnectionIds}
                            onConnect={handleConnect}
                            onManage={handleManage}
                            onToggleBoard={mode === 'board' ? handleToggleBoard : undefined}
                            excludeCategories={excludeCategories}
                        />
                    </TabsContent>

                    <TabsContent value="connections" className="flex-1 min-h-0 overflow-y-auto">
                        {connections.length === 0 ? (
                            <div className="py-12 text-center">
                                <Plug className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                                <p className="text-sm text-muted-foreground">
                                    No integrations connected yet.
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Go to the Catalog tab to connect one.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {connections
                                    .filter((conn) => {
                                        if (!excludeCategories?.length) return true
                                        const def = catalogItems.find(
                                            (item) => item.definition.id === conn.definition_id
                                        )?.definition
                                        if (!def) return true
                                        return !excludeCategories.some(cat => def.categories?.includes(cat))
                                    })
                                    .map((conn) => {
                                    const def = catalogItems.find(
                                        (item) => item.definition.id === conn.definition_id
                                    )?.definition
                                    if (!def) return null
                                    return (
                                        <IntegrationConnectionCard
                                            key={conn.id}
                                            definition={def}
                                            connection={conn}
                                            mode={mode}
                                            isOnBoard={boardConnectionIds.has(conn.id)}
                                            onEdit={() => handleManage(def, conn)}
                                            onDisconnect={() => setDisconnectTarget(conn)}
                                            onTest={() => handleTest(conn)}
                                            onToggleBoard={
                                                mode === 'board'
                                                    ? (add) => handleToggleBoard(conn, add)
                                                    : undefined
                                            }
                                            testLoading={testingId === conn.id}
                                        />
                                    )
                                })}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            )}

            {/* Setup Dialog */}
            {setupDef && (
                <IntegrationSetupDialog
                    definition={setupDef}
                    connection={setupConn}
                    open={!!setupDef}
                    onOpenChange={(open) => {
                        if (!open) {
                            setSetupDef(null)
                            setSetupConn(null)
                        }
                    }}
                    onSave={handleSaveConnection}
                    onDisconnect={
                        setupConn
                            ? () => {
                                  setDisconnectTarget(setupConn)
                              }
                            : undefined
                    }
                    onInitiateOAuth={
                        setupDef.auth_type === 'oauth2' ? handleInitiateOAuth : undefined
                    }
                    saving={saving}
                />
            )}

            {/* Create Dialog */}
            <IntegrationCreateDialog
                open={showCreate}
                onOpenChange={setShowCreate}
                onSave={handleCreateDefinition}
                saving={saving}
            />

            {/* Disconnect Confirmation */}
            <ConfirmDeleteDialog
                open={!!disconnectTarget}
                onOpenChange={(open) => {
                    if (!open) setDisconnectTarget(null)
                }}
                onConfirm={handleDisconnect}
                title="Disconnect integration?"
                description="The integration credentials will be removed. Any boards using this integration will lose access."
                confirmLabel="Disconnect"
                loading={disconnecting}
            />
        </>
    )

    // Render as embedded or dialog
    if (embedded) {
        return <div className="space-y-4">{content}</div>
    }

    const dialogClassName = size === 'full'
        ? 'sm:max-w-[95vw] w-[95vw] max-h-[92vh] h-[92vh] flex flex-col'
        : 'sm:max-w-4xl max-h-[85vh] flex flex-col'

    return (
        <Dialog open={true} onOpenChange={(open) => { if (!open) onClose?.() }}>
            <DialogContent className={dialogClassName}>
                <DialogHeader>
                    <DialogTitle className="text-sm flex items-center gap-2">
                        <Plug className="w-4 h-4" />
                        {mode === 'board' ? 'Board Integrations' : 'Integration Marketplace'}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    {content}
                </div>
            </DialogContent>
        </Dialog>
    )
}
