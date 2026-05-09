'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePod, useUpdatePod, useDeletePod } from '@/hooks/use-pods'
import { ExecutionHistoryPanel } from '@/components/pods/execution-history-panel'
import { HeartbeatConfigForm } from '@/components/pods/heartbeat-config-form'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { AutonomyDial } from '@/components/orchestration/autonomy-dial'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Layers, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const PRESET_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
]

export default function PodSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params)
    const router = useRouter()
    const { data: pod, isLoading } = usePod(slug)
    const updatePod = useUpdatePod()
    const deletePodMut = useDeletePod()

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [icon, setIcon] = useState('')
    const [color, setColor] = useState('')
    const [initialized, setInitialized] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleteLoading, setDeleteLoading] = useState(false)

    // Initialize form values from pod data
    if (pod && !initialized) {
        setName(pod.name)
        setDescription(pod.description || '')
        setIcon(pod.icon || '')
        setColor(pod.color || PRESET_COLORS[0])
        setInitialized(true)
    }

    const handleSave = async () => {
        if (!pod) return

        const result = await updatePod.mutateAsync({
            podId: pod.id,
            payload: {
                name: name.trim(),
                description: description.trim() || undefined,
                icon: icon.trim() || undefined,
                color,
            },
        })

        if (result.success) {
            toast.success('Pod updated')
        } else if (result.error) {
            toast.error(result.error)
        }
    }

    const handleDelete = async () => {
        if (!pod) return
        setDeleteLoading(true)
        try {
            const result = await deletePodMut.mutateAsync(pod.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Pod deleted')
                router.push('/dashboard/cockpit')
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete pod')
        } finally {
            setDeleteLoading(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        )
    }

    if (!pod) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <Layers className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Pod not found</h2>
                <Button onClick={() => router.push('/dashboard/cockpit')}>Back to Cockpit</Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink href="/dashboard/cockpit">Cockpit</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink href={`/dashboard/pods/${slug}`}>{pod.name}</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage>Settings</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto max-w-3xl">
                <Tabs defaultValue="general">
                    <TabsList>
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="autonomy">Autonomy</TabsTrigger>
                        <TabsTrigger value="heartbeat">Heartbeat</TabsTrigger>
                        <TabsTrigger value="execution-log">Execution Log</TabsTrigger>
                    </TabsList>

                    <TabsContent value="general" className="space-y-6 pt-4">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="settings-name">Name</Label>
                                <Input
                                    id="settings-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="settings-description">Description</Label>
                                <Textarea
                                    id="settings-description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="settings-icon">Icon (emoji)</Label>
                                <Input
                                    id="settings-icon"
                                    value={icon}
                                    onChange={(e) => setIcon(e.target.value)}
                                    maxLength={4}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Color</Label>
                                <div className="flex gap-2">
                                    {PRESET_COLORS.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setColor(c)}
                                            className={cn(
                                                'w-7 h-7 rounded-full transition-all',
                                                color === c
                                                    ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110'
                                                    : 'hover:scale-110',
                                            )}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <Button onClick={handleSave} disabled={updatePod.isPending}>
                                {updatePod.isPending ? 'Saving...' : 'Save changes'}
                            </Button>
                        </div>

                        {/* Danger zone */}
                        <div className="border border-destructive/20 rounded-lg p-4 mt-8">
                            <h3 className="text-sm font-semibold text-destructive mb-2">Danger Zone</h3>
                            <p className="text-xs text-muted-foreground mb-3">
                                Permanently delete this pod. Boards will become unassigned but not deleted.
                            </p>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setShowDeleteConfirm(true)}
                            >
                                Delete Pod
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="autonomy" className="pt-4 space-y-4">
                        <div>
                            <h3 className="text-sm font-semibold mb-1">Autonomy Level</h3>
                            <p className="text-xs text-muted-foreground mb-4">
                                Control how independently this pod&apos;s AI agent operates.
                            </p>
                            <AutonomyDialWrapper pod={pod} />
                        </div>
                    </TabsContent>

                    <TabsContent value="heartbeat" className="pt-4">
                        <HeartbeatConfigForm podId={pod.id} />
                    </TabsContent>

                    <TabsContent value="execution-log" className="pt-4">
                        <ExecutionHistoryPanel podId={pod.id} />
                    </TabsContent>
                </Tabs>
            </div>

            <ConfirmDeleteDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                onConfirm={handleDelete}
                title="Delete pod?"
                description={`Are you sure you want to delete "${pod.name}"? Boards will become unassigned but not deleted.`}
                loading={deleteLoading}
            />
        </div>
    )
}

// ── AutonomyDialWrapper ─────────────────────────────────────────────────────
// Wraps AutonomyDial with useUpdatePod mutation.

function AutonomyDialWrapper({ pod }: { pod: { id: string; account_id: string; autonomy_level?: number } }) {
    const updatePod = useUpdatePod()
    const [currentLevel, setCurrentLevel] = useState(pod.autonomy_level ?? 1)

    const handleLevelChange = async (level: number) => {
        await updatePod.mutateAsync({
            podId: pod.id,
            payload: { autonomy_level: level },
        })
        setCurrentLevel(level)
        toast.success('Autonomy level updated')
    }

    return (
        <AutonomyDial
            currentLevel={currentLevel}
            onLevelChange={handleLevelChange}
            saving={updatePod.isPending}
        />
    )
}
