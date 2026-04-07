'use client'

import { useState } from 'react'
import { usePods, useDeletePod } from '@/hooks/use-pods'
import { PodCard } from '@/components/pods/pod-card'
import { CreatePodDialog } from '@/components/pods/create-pod-dialog'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Plus, Layers } from 'lucide-react'
import { toast } from 'sonner'
import type { Pod } from '@/types/pod'

export default function CockpitPage() {
    const { data: pods, isLoading } = usePods()
    const deletePod = useDeletePod()
    const [showCreate, setShowCreate] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    const handleDelete = (pod: Pod) => {
        setDeleteTarget({ id: pod.id, name: pod.name })
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const result = await deletePod.mutateAsync(deleteTarget.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                setDeleteTarget(null)
                toast.success('Pod deleted')
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete pod')
        } finally {
            setDeleteLoading(false)
        }
    }

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Page Header */}
            <header className="flex h-16 shrink-0 items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <h1 className="text-lg font-bold">Workspace Cockpit</h1>
                    {pods && pods.length > 0 && (
                        <span className="text-xs text-muted-foreground font-medium bg-accent/50 px-2 py-0.5 rounded">
                            {pods.length}
                        </span>
                    )}
                </div>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    New Pod
                </Button>
            </header>

            <p className="text-sm text-muted-foreground pb-4">
                Monitor and manage all your Pods from one place
            </p>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {isLoading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
                        ))}
                    </div>
                ) : !pods || pods.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 rounded-xl bg-accent/50 flex items-center justify-center mb-4">
                            <Layers className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2">No Pods yet</h2>
                        <p className="text-muted-foreground mb-6 max-w-sm">
                            Create your first Pod to organize your boards and AI agents into focused departments
                        </p>
                        <Button onClick={() => setShowCreate(true)}>
                            <Plus className="w-4 h-4 mr-1" />
                            Create your first Pod
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {pods.map((pod) => (
                            <PodCard key={pod.id} pod={pod} onDelete={handleDelete} />
                        ))}
                    </div>
                )}
            </div>

            <CreatePodDialog open={showCreate} onOpenChange={setShowCreate} />

            <ConfirmDeleteDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={confirmDelete}
                title="Delete pod?"
                description="This will permanently delete this pod. Boards will become unassigned."
                loading={deleteLoading}
            />
        </div>
    )
}
