'use client'

import { useState, useCallback } from 'react'
import { Plus, Loader2, BrainCircuit } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { PageLayout, PageHeader, PageContent } from '@/components/page-layout'
import { BackboneConnectionCard } from '@/components/backbones/backbone-connection-card'
import { BackboneConnectionDialog } from '@/components/backbones/backbone-connection-dialog'
import {
    useBackboneConnections,
    useCreateBackboneConnection,
    useUpdateBackboneConnection,
    useDeleteBackboneConnection,
    useVerifyBackboneConnection,
    useSetDefaultBackboneConnection,
} from '@/hooks/use-backbone-connections'
import { useBackboneDefinitions } from '@/hooks/use-backbone-definitions'
import type {
    BackboneConnection,
    CreateBackboneConnectionPayload,
    UpdateBackboneConnectionPayload,
} from '@/types/backbone'

export default function BackbonesSettingsPage() {
    const { data: connections = [], isLoading } = useBackboneConnections()
    const { data: definitions = [] } = useBackboneDefinitions()

    const createMutation = useCreateBackboneConnection()
    const updateMutation = useUpdateBackboneConnection()
    const deleteMutation = useDeleteBackboneConnection()
    const verifyMutation = useVerifyBackboneConnection()
    const setDefaultMutation = useSetDefaultBackboneConnection()

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingConnection, setEditingConnection] = useState<BackboneConnection | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
    const [testingId, setTestingId] = useState<string | null>(null)

    // Open dialog for creating
    const handleAddNew = () => {
        setEditingConnection(null)
        setDialogOpen(true)
    }

    // Open dialog for editing
    const handleEdit = (connection: BackboneConnection) => {
        setEditingConnection(connection)
        setDialogOpen(true)
    }

    // Save (create or update)
    const handleSave = async (
        data: CreateBackboneConnectionPayload | (UpdateBackboneConnectionPayload & { connectionId: string })
    ) => {
        if ('connectionId' in data) {
            const { connectionId, ...payload } = data
            const result = await updateMutation.mutateAsync({ connectionId, ...payload })
            if (result.error) {
                toast.error(result.error)
                throw new Error(result.error)
            }
            toast.success('Backbone connection updated')
        } else {
            const result = await createMutation.mutateAsync(data)
            if (result.error) {
                toast.error(result.error)
                throw new Error(result.error)
            }
            toast.success('Backbone connection created')
        }
        setDialogOpen(false)
        setEditingConnection(null)
    }

    // Test connection
    const handleTest = async (connectionId: string) => {
        setTestingId(connectionId)
        try {
            const result = await verifyMutation.mutateAsync(connectionId)
            if (result.success) {
                toast.success('Connection verified successfully')
            } else {
                toast.error(result.error || 'Connection failed — check URL and credentials')
            }
        } finally {
            setTestingId(null)
        }
    }

    // Delete
    const confirmDelete = async () => {
        if (!deleteTarget) return
        try {
            const result = await deleteMutation.mutateAsync(deleteTarget)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Backbone connection deleted')
                setDeleteTarget(null)
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to delete')
        }
    }

    // Set default
    const handleSetDefault = async (connectionId: string) => {
        try {
            const result = await setDefaultMutation.mutateAsync(connectionId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Default backbone updated')
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to set default')
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        )
    }

    return (
        <PageLayout
            header={
                <PageHeader
                    icon={<BrainCircuit className="w-4 h-4 text-primary" />}
                    title="AI Backbones"
                    meta={
                        <span className="text-xs text-muted-foreground px-2 py-0.5 bg-accent rounded-full">
                            {connections.length}
                        </span>
                    }
                    actions={
                        <Button size="sm" onClick={handleAddNew}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Add New
                        </Button>
                    }
                />
            }
        >
            <PageContent className="p-6 max-w-4xl mx-auto w-full">
                <p className="text-sm text-muted-foreground mb-6">
                    Connect and manage AI backbone providers that power your agents and workflows.
                </p>

                {/* Connection cards */}
                {connections.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                        {connections.map((conn) => (
                            <BackboneConnectionCard
                                key={conn.id}
                                connection={conn}
                                onEdit={() => handleEdit(conn)}
                                onTest={() => handleTest(conn.id)}
                                onDelete={() => setDeleteTarget(conn.id)}
                                onSetDefault={() => handleSetDefault(conn.id)}
                                testLoading={testingId === conn.id}
                            />
                        ))}
                    </div>
                ) : (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <BrainCircuit className="h-10 w-10 text-muted-foreground mb-3" />
                            <h3 className="text-sm font-semibold mb-1">No backbone connections</h3>
                            <p className="text-xs text-muted-foreground mb-4 max-w-sm">
                                Add an AI backbone to start powering your agents.
                            </p>
                            <Button variant="outline" size="sm" onClick={handleAddNew}>
                                <Plus className="h-3 w-3 mr-1.5" />
                                Add Your First Backbone
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Available backbone types */}
                {definitions.length > 0 && (
                    <div className="mt-10">
                        <h2 className="text-sm font-semibold mb-1">Available Backbone Types</h2>
                        <p className="text-xs text-muted-foreground mb-4">
                            Supported AI backbone providers you can connect.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            {definitions
                                .filter((d) => d.available)
                                .map((def) => (
                                    <div key={def.slug} className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-card">
                                        <span className="text-lg">{def.icon || '🧠'}</span>
                                        <div>
                                            <p className="text-xs font-medium">{def.label}</p>
                                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 mt-0.5">{def.protocol}</Badge>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

            </PageContent>
        </PageLayout>

        {/* Create/Edit Dialog */}
        <BackboneConnectionDialog
            open={dialogOpen}
            onOpenChange={(open) => {
                setDialogOpen(open)
                if (!open) setEditingConnection(null)
            }}
            connection={editingConnection}
            onSave={handleSave}
            onTest={handleTest}
            saving={createMutation.isPending || updateMutation.isPending}
            testing={!!testingId}
        />

        {/* Delete confirmation */}
        <ConfirmDeleteDialog
            open={!!deleteTarget}
            onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
            onConfirm={confirmDelete}
            title="Delete backbone connection?"
            description="This will permanently remove this backbone connection. Any boards or steps using it will fall back to the account default."
            confirmLabel="Delete"
            loading={deleteMutation.isPending}
        />
    )
}
