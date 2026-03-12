'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs'
import {
    Loader2, Plus, Pencil, Trash2, Eye, EyeOff,
    CheckCircle, XCircle, Link2, Unlink, Filter,
    GripVertical, RefreshCw, Brain, BookOpen, X, Settings2,
} from 'lucide-react'
import {
    getCategories, createCategory, updateCategory, deleteCategory,
    getSources, updateSource, getSourceProperties,
} from './actions'
import { toast } from 'sonner'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { cn } from '@/lib/utils'
import { getSkills, getSkillsForCategory, getCategorySkillsMap, linkSkillToCategory, unlinkSkillFromCategory } from '../skills/actions'
import { getAgentSyncStatus, triggerSync, type SyncStatusDetail } from '../agent-sync/actions'
import { getKnowledgeDocs } from '../../knowledge/actions'

// ============================================================================
// Types
// ============================================================================

interface Category {
    id: string
    name: string
    color: string | null
    icon: string | null
    visible: boolean
    account_id: string
    created_at: string
}

interface Skill {
    id: string
    name: string
    description: string
    is_active: boolean
}

interface KnowledgeDoc {
    id: string
    title: string
    category_id: string | null
    is_master: boolean
}

interface Source {
    id: string
    provider: string
    config: Record<string, any>
    category_id: string
    sync_status: string
    is_active: boolean
    sync_filters: SyncFilter[]
    category_property: string | null
    categories?: { id: string; name: string; color: string }
}

interface SyncFilter {
    property: string
    type: string
    condition: string
    value: any
}

interface SourceProperty {
    name: string
    type: string
    id: string
    options?: Array<{ name: string; color?: string; value?: any }>
    groups?: Array<{ name: string; option_ids: string[] }>
}

const CATEGORY_COLORS = [
    '#22c55e', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
    '#a855f7', '#eab308', '#84cc16', '#0ea5e9', '#d946ef',
]

/** Map Notion color names to CSS colors */
function notionColorToCSS(color?: string): string {
    const map: Record<string, string> = {
        default: '#9ca3af',
        gray: '#9ca3af',
        brown: '#a16207',
        orange: '#f97316',
        yellow: '#eab308',
        green: '#22c55e',
        blue: '#3b82f6',
        purple: '#8b5cf6',
        pink: '#ec4899',
        red: '#ef4444',
    }
    return map[color || 'default'] || map.default
}

const FILTER_CONDITIONS: Record<string, { label: string; value: string }[]> = {
    checkbox: [
        { label: 'Is', value: 'equals' },
    ],
    select: [
        { label: 'Is', value: 'equals' },
        { label: 'Is not', value: 'does_not_equal' },
        { label: 'Is empty', value: 'is_empty' },
        { label: 'Is not empty', value: 'is_not_empty' },
    ],
    multi_select: [
        { label: 'Contains', value: 'contains' },
        { label: 'Does not contain', value: 'does_not_contain' },
        { label: 'Is empty', value: 'is_empty' },
        { label: 'Is not empty', value: 'is_not_empty' },
    ],
    status: [
        { label: 'Is', value: 'equals' },
        { label: 'Is not', value: 'does_not_equal' },
    ],
    rich_text: [
        { label: 'Contains', value: 'contains' },
        { label: 'Does not contain', value: 'does_not_contain' },
        { label: 'Is empty', value: 'is_empty' },
        { label: 'Is not empty', value: 'is_not_empty' },
    ],
    number: [
        { label: 'Equals', value: 'equals' },
        { label: 'Does not equal', value: 'does_not_equal' },
        { label: 'Greater than', value: 'greater_than' },
        { label: 'Less than', value: 'less_than' },
    ],
    date: [
        { label: 'Is empty', value: 'is_empty' },
        { label: 'Is not empty', value: 'is_not_empty' },
    ],
    title: [
        { label: 'Contains', value: 'contains' },
        { label: 'Does not contain', value: 'does_not_contain' },
    ],
    // ClickUp built-in
    priority: [
        { label: 'Is', value: 'equals' },
    ],
    tags: [
        { label: 'Contains', value: 'contains' },
    ],
}

// ============================================================================
// Main Page
// ============================================================================

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([])
    const [sources, setSources] = useState<Source[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [editingCategory, setEditingCategory] = useState<Category | null>(null)
    const [filterSourceId, setFilterSourceId] = useState<string | null>(null)
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    // Background-loaded data (non-blocking)
    const [syncDetails, setSyncDetails] = useState<Map<string, SyncStatusDetail>>(new Map())
    const [categorySkills, setCategorySkills] = useState<Map<string, Skill[]>>(new Map())

    // Edit dialog lazy-loaded data
    const [editLoading, setEditLoading] = useState(false)
    const [allSkills, setAllSkills] = useState<Skill[]>([])
    const [allKnowledgeDocs, setAllKnowledgeDocs] = useState<KnowledgeDoc[]>([])
    const [editCategorySkills, setEditCategorySkills] = useState<Skill[]>([])

    const [linkingCategory, setLinkingCategory] = useState<string | null>(null)
    const searchParams = useSearchParams()

    // ── Step 1: Fast initial load — only categories + sources ──
    const loadListData = useCallback(async () => {
        setLoading(true)
        const [catData, srcData] = await Promise.all([
            getCategories(),
            getSources(),
        ])
        setCategories(catData)
        setSources(srcData)
        setLoading(false)
        return catData
    }, [])

    useEffect(() => { loadListData() }, [loadListData])

    // ── Step 2: Background load sync status + skill chips (non-blocking) ──
    useEffect(() => {
        // Load sync status in background
        getAgentSyncStatus().then((syncData) => {
            if (syncData?.details) {
                const map = new Map<string, SyncStatusDetail>()
                for (const d of syncData.details) map.set(d.category_id, d)
                setSyncDetails(map)
            }
        }).catch(() => {})

        // Load category skills map in background (1 call replaces N)
        getCategorySkillsMap().then((map) => {
            const skillsMap = new Map<string, Skill[]>()
            for (const [catId, skills] of Object.entries(map)) {
                if (skills.length > 0) skillsMap.set(catId, skills)
            }
            setCategorySkills(skillsMap)
        }).catch(() => {})
    }, [])

    // ── Step 3: Lazy load edit data when dialog opens ──
    const loadEditData = useCallback(async (categoryId: string) => {
        setEditLoading(true)
        const [skillsData, knowledgeData, catSkills] = await Promise.all([
            getSkills(),
            getKnowledgeDocs().catch(() => []),
            getSkillsForCategory(categoryId).catch(() => []),
        ])
        setAllSkills(skillsData || [])
        setAllKnowledgeDocs(knowledgeData || [])
        setEditCategorySkills(catSkills || [])
        setEditLoading(false)
    }, [])

    const openEditDialog = useCallback((cat: Category) => {
        setEditingCategory(cat)
        loadEditData(cat.id)
    }, [loadEditData])

    // Auto-open edit dialog when navigating with ?edit=categoryId
    useEffect(() => {
        const editId = searchParams.get('edit')
        if (editId && categories.length > 0 && !editingCategory) {
            const cat = categories.find((c) => c.id === editId)
            if (cat) openEditDialog(cat)
        }
    }, [searchParams, categories]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Targeted mutations (no full reload) ──

    const handleToggleVisibility = async (cat: Category) => {
        const result = await updateCategory(cat.id, { visible: !cat.visible })
        if (result.error) {
            setAlert({ type: 'error', message: result.error })
        } else {
            setCategories((prev) => prev.map((c) => c.id === cat.id ? { ...c, visible: !c.visible } : c))
        }
    }

    const requestDelete = (catId: string) => {
        const linkedSources = sources.filter((s) => s.category_id === catId)
        if (linkedSources.length > 0) {
            setAlert({
                type: 'error',
                message: 'Cannot delete a category with linked sources. Unlink or delete sources first.',
            })
            return
        }
        setDeleteTarget(catId)
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const result = await deleteCategory(deleteTarget)
            if (result.error) {
                toast.error(result.error)
            } else {
                setDeleteTarget(null)
                setDeletingId(deleteTarget)
                setTimeout(() => {
                    setCategories((prev) => prev.filter((c) => c.id !== deleteTarget))
                    setCategorySkills((prev) => {
                        const next = new Map(prev)
                        next.delete(deleteTarget)
                        return next
                    })
                    setDeletingId(null)
                    toast.success('Category deleted')
                }, 500)
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to delete category')
        } finally {
            setDeleteLoading(false)
        }
    }

    const handleLinkSkill = async (categoryId: string, skillId: string) => {
        try {
            await linkSkillToCategory(skillId, categoryId)
            setLinkingCategory(null)
            // Update edit dialog skills
            const skill = allSkills.find((s) => s.id === skillId)
            if (skill) {
                setEditCategorySkills((prev) => [...prev, skill])
                setCategorySkills((prev) => {
                    const next = new Map(prev)
                    const existing = next.get(categoryId) || []
                    next.set(categoryId, [...existing, skill])
                    return next
                })
            }
        } catch (e: any) {
            setAlert({ type: 'error', message: e.message || 'Failed to link skill' })
        }
    }

    const handleUnlinkSkill = async (categoryId: string, skillId: string) => {
        try {
            await unlinkSkillFromCategory(skillId, categoryId)
            // Update edit dialog skills
            setEditCategorySkills((prev) => prev.filter((s) => s.id !== skillId))
            setCategorySkills((prev) => {
                const next = new Map(prev)
                const existing = next.get(categoryId) || []
                next.set(categoryId, existing.filter((s) => s.id !== skillId))
                return next
            })
        } catch (e: any) {
            setAlert({ type: 'error', message: e.message || 'Failed to unlink skill' })
        }
    }

    const handleSyncCategory = async (categoryId: string) => {
        try {
            await triggerSync(categoryId)
            setAlert({ type: 'success', message: 'Sync triggered successfully.' })
            // Refresh sync status only
            const syncData = await getAgentSyncStatus()
            if (syncData?.details) {
                const map = new Map<string, SyncStatusDetail>()
                for (const d of syncData.details) map.set(d.category_id, d)
                setSyncDetails(map)
            }
        } catch (e: any) {
            setAlert({ type: 'error', message: e.message || 'Sync failed' })
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
                <h1 className="text-3xl font-bold">Categories</h1>
                <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Category
                </Button>
            </div>
            <p className="text-muted-foreground mb-6">
                Manage your board categories, control visibility, and link them to external properties.
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

            {/* Category List */}
            <div className="space-y-3">
                {categories.map((cat) => {
                    const directSources = sources.filter((s) => s.category_id === cat.id)
                    // Shared sources: have category_property set (distribute to all categories) but aren't directly linked
                    const sharedSources = sources.filter(
                        (s) => s.category_id !== cat.id && s.category_property,
                    )
                    return (
                        <CategoryCard
                            key={cat.id}
                            category={cat}
                            linkedSources={directSources}
                            sharedSources={sharedSources}
                            linkedSkills={categorySkills.get(cat.id) || []}
                            allSkills={allSkills}
                            syncDetail={syncDetails.get(cat.id)}
                            isLinking={linkingCategory === cat.id}
                            onToggleVisibility={() => handleToggleVisibility(cat)}
                            isAnimatingDelete={deletingId === cat.id}
                            onEdit={() => openEditDialog(cat)}
                            onDelete={() => requestDelete(cat.id)}
                            onConfigureFilters={(sourceId) => setFilterSourceId(sourceId)}
                            onLinkSkill={(skillId) => handleLinkSkill(cat.id, skillId)}
                            onUnlinkSkill={(skillId) => handleUnlinkSkill(cat.id, skillId)}
                            onToggleLinking={() => setLinkingCategory(linkingCategory === cat.id ? null : cat.id)}
                            onSync={() => handleSyncCategory(cat.id)}
                        />
                    )
                })}
            </div>

            {categories.length === 0 && (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="text-4xl mb-4">📂</div>
                        <h3 className="text-lg font-semibold mb-2">No categories yet</h3>
                        <p className="text-muted-foreground mb-4">
                            Create categories to organize your tasks across sources.
                        </p>
                        <Button onClick={() => setShowCreateDialog(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create First Category
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Create/Edit Dialog */}
            <CategoryDialog
                open={showCreateDialog || editingCategory !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowCreateDialog(false)
                        setEditingCategory(null)
                        setEditCategorySkills([])
                    }
                }}
                category={editingCategory}
                editLoading={editLoading}
                linkedSources={editingCategory ? sources.filter((s) => s.category_id === editingCategory.id) : undefined}
                allSources={sources}
                allSkills={allSkills}
                linkedSkills={editingCategory ? editCategorySkills : []}
                allKnowledgeDocs={allKnowledgeDocs}
                onLinkSkill={(skillId) => editingCategory && handleLinkSkill(editingCategory.id, skillId)}
                onUnlinkSkill={(skillId) => editingCategory && handleUnlinkSkill(editingCategory.id, skillId)}
                onSaved={() => {
                    setShowCreateDialog(false)
                    setEditingCategory(null)
                    setEditCategorySkills([])
                    // Only reload list data (fast)
                    loadListData()
                    setAlert({ type: 'success', message: editingCategory ? 'Category updated.' : 'Category created.' })
                }}
            />

            {/* Source Filter Dialog */}
            {filterSourceId && (
                <SourceFilterDialog
                    source={sources.find((s) => s.id === filterSourceId)!}
                    open={!!filterSourceId}
                    onOpenChange={(open) => { if (!open) setFilterSourceId(null) }}
                    onSaved={() => {
                        setFilterSourceId(null)
                        loadListData()
                        setAlert({ type: 'success', message: 'Source filters updated.' })
                    }}
                />
            )}

            <ConfirmDeleteDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={confirmDelete}
                title="Delete category?"
                description="Tasks in this category will lose their assignment."
                loading={deleteLoading}
            />
        </div>
    )
}

// ============================================================================
// Category Card
// ============================================================================

function SyncBadge({ status }: { status?: string }) {
    switch (status) {
        case 'synced':
            return <Badge className="text-[10px] px-1.5 py-0 bg-green-600/20 text-green-400 border-green-600/30">Synced</Badge>
        case 'syncing':
            return <Badge className="text-[10px] px-1.5 py-0 bg-blue-600/20 text-blue-400 border-blue-600/30">Syncing</Badge>
        case 'pending':
        case 'stale':
            return <Badge className="text-[10px] px-1.5 py-0 bg-yellow-600/20 text-yellow-400 border-yellow-600/30">Pending</Badge>
        case 'error':
            return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Error</Badge>
        default:
            return null
    }
}

function CategoryCard({
    category, linkedSources, sharedSources, linkedSkills, allSkills,
    syncDetail, isLinking, isAnimatingDelete, onToggleVisibility, onEdit, onDelete,
    onConfigureFilters, onLinkSkill, onUnlinkSkill, onToggleLinking, onSync,
}: {
    category: Category
    linkedSources: Source[]
    sharedSources: Source[]
    linkedSkills: Skill[]
    allSkills: Skill[]
    syncDetail?: SyncStatusDetail
    isLinking: boolean
    isAnimatingDelete: boolean
    onToggleVisibility: () => void
    onEdit: () => void
    onDelete: () => void
    onConfigureFilters: (sourceId: string) => void
    onLinkSkill: (skillId: string) => void
    onUnlinkSkill: (skillId: string) => void
    onToggleLinking: () => void
    onSync: () => void
}) {
    const [syncing, setSyncing] = useState(false)
    const color = category.color || '#71717a'
    const allSources = [...linkedSources, ...sharedSources]
    const linkedSkillIds = new Set(linkedSkills.map((s) => s.id))
    const availableSkills = allSkills.filter((s) => !linkedSkillIds.has(s.id) && s.is_active)

    const handleSync = async () => {
        setSyncing(true)
        await onSync()
        setSyncing(false)
    }

    return (
        <Card className={cn(!category.visible && 'opacity-60', isAnimatingDelete && 'animate-deleting')}>
            <CardContent className="py-4">
                <div className="flex items-center gap-4">
                    {/* Color indicator */}
                    <div
                        className="w-4 h-4 rounded-full shrink-0 ring-2 ring-offset-2 ring-offset-background"
                        style={{ backgroundColor: color, ['--tw-ring-color' as any]: color }}
                    />

                    {/* Name & Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-base">{category.name}</h3>
                            {!category.visible && (
                                <Badge variant="secondary" className="text-xs">
                                    <EyeOff className="h-3 w-3 mr-1" />
                                    Hidden
                                </Badge>
                            )}
                            {syncDetail && syncDetail.sync_status !== 'none' && (
                                <SyncBadge status={syncDetail.sync_status} />
                            )}
                        </div>

                        {/* Sources (direct + shared via category_property) */}
                        {allSources.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                {allSources.map((src) => {
                                    const isShared = !linkedSources.find((ls) => ls.id === src.id)
                                    return (
                                        <div
                                            key={src.id}
                                            className={`flex items-center gap-1.5 text-xs rounded-md px-2 py-1 ${isShared ? 'bg-accent/50 border border-dashed border-border' : 'bg-accent'}`}
                                        >
                                            <span>{src.provider === 'notion' ? '📝' : '⚡'}</span>
                                            <span className="capitalize">{src.provider}</span>
                                            {isShared && (
                                                <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">
                                                    shared
                                                </Badge>
                                            )}
                                            {src.category_property && (
                                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                                    prop: {src.category_property}
                                                </Badge>
                                            )}
                                            {src.sync_filters && src.sync_filters.length > 0 && (
                                                <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-500/10 text-blue-500 border-blue-500/30">
                                                    <Filter className="h-2.5 w-2.5 mr-0.5" />
                                                    {src.sync_filters.length}
                                                </Badge>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground mt-0.5">
                                No sources linked — local tasks only
                            </p>
                        )}

                        {/* Linked Skills */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {linkedSkills.length > 0 && (
                                <>
                                    <Brain className="h-3 w-3 text-indigo-400 shrink-0" />
                                    {linkedSkills.map((skill) => (
                                        <div
                                            key={skill.id}
                                            className="flex items-center gap-1 text-[11px] rounded-md px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                        >
                                            <span>{skill.name}</span>
                                            <button
                                                onClick={() => onUnlinkSkill(skill.id)}
                                                className="hover:text-red-400 transition-colors"
                                                title={`Unlink ${skill.name}`}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </>
                            )}
                            {syncDetail?.has_knowledge && (
                                <div className="flex items-center gap-1 text-[11px] rounded-md px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    <BookOpen className="h-3 w-3" />
                                    <span>Knowledge</span>
                                </div>
                            )}
                            <button
                                onClick={onToggleLinking}
                                className="flex items-center gap-1 text-[11px] rounded-md px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-dashed border-border"
                            >
                                <Plus className="h-3 w-3" />
                                <span>Skill</span>
                            </button>
                        </div>

                        {/* Skill linking dropdown */}
                        {isLinking && availableSkills.length > 0 && (
                            <div className="mt-2 p-2 rounded-lg border bg-card space-y-1">
                                <p className="text-xs text-muted-foreground mb-1">Link a skill:</p>
                                {availableSkills.map((skill) => (
                                    <button
                                        key={skill.id}
                                        onClick={() => onLinkSkill(skill.id)}
                                        className="flex items-center gap-2 w-full text-left text-xs rounded px-2 py-1.5 hover:bg-accent transition-colors"
                                    >
                                        <Brain className="h-3 w-3 text-indigo-400" />
                                        <span>{skill.name}</span>
                                        {skill.description && (
                                            <span className="text-muted-foreground truncate">— {skill.description}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                        {isLinking && availableSkills.length === 0 && (
                            <div className="mt-2 p-2 rounded-lg border bg-card">
                                <p className="text-xs text-muted-foreground">
                                    No more skills available to link. Create new skills in Settings &gt; Skills.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                        {(linkedSkills.length > 0 || syncDetail?.has_knowledge) && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={handleSync}
                                disabled={syncing}
                                title="Sync to provider"
                            >
                                {syncing ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                )}
                            </Button>
                        )}
                        <div className="flex items-center gap-2 mr-2">
                            <Label htmlFor={`vis-${category.id}`} className="text-xs text-muted-foreground sr-only">
                                Visible
                            </Label>
                            <Switch
                                id={`vis-${category.id}`}
                                checked={category.visible}
                                onCheckedChange={onToggleVisibility}
                            />
                            {category.visible ? (
                                <Eye className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                            )}
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
// Create/Edit Category Dialog (with inline source filters)
// ============================================================================

function CategoryDialog({ open, onOpenChange, category, onSaved, editLoading, linkedSources, allSources, allSkills, linkedSkills, allKnowledgeDocs, onLinkSkill, onUnlinkSkill }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    category: Category | null
    onSaved: () => void
    editLoading?: boolean
    linkedSources?: Source[]
    allSources?: Source[]
    allSkills?: Skill[]
    linkedSkills?: Skill[]
    allKnowledgeDocs?: KnowledgeDoc[]
    onLinkSkill?: (skillId: string) => void
    onUnlinkSkill?: (skillId: string) => void
}) {
    const isEdit = !!category
    const [name, setName] = useState('')
    const [color, setColor] = useState('#22c55e')
    const [icon, setIcon] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Source filter state (only for edit mode with linked sources)
    const [properties, setProperties] = useState<SourceProperty[]>([])
    const [loadingProps, setLoadingProps] = useState(false)
    const [sourceFilters, setSourceFilters] = useState<Record<string, SyncFilter[]>>({})
    const [sourceCategoryProps, setSourceCategoryProps] = useState<Record<string, string>>({})
    const [activeSourceId, setActiveSourceId] = useState<string | null>(null)

    // For linking unlinked categories to existing sources
    const [selectedLinkSourceId, setSelectedLinkSourceId] = useState<string | null>(null)

    const directSources = linkedSources || []
    // Shared sources = sources with category_property set (they distribute to ALL categories)
    const sharedWithCategoryProp = (allSources || []).filter(
        (s) => !directSources.find((ds) => ds.id === s.id) && s.category_property,
    )
    // Other sources available to link (no category_property, not directly linked)
    const otherAvailableSources = (allSources || []).filter(
        (s) => !directSources.find((ds) => ds.id === s.id) && !s.category_property,
    )
    // Active working sources: direct + auto-shared (have category_property) + manually selected
    const sources = [
        ...directSources,
        ...sharedWithCategoryProp,
        ...(selectedLinkSourceId && !sharedWithCategoryProp.find((s) => s.id === selectedLinkSourceId)
            ? otherAvailableSources.filter((s) => s.id === selectedLinkSourceId)
            : []),
    ]
    const hasLinkedSources = isEdit && sources.length > 0
    const hasAvailableSources = isEdit && otherAvailableSources.length > 0

    useEffect(() => {
        if (open) {
            setName(category?.name || '')
            setColor(category?.color || '#22c55e')
            setIcon(category?.icon || '')
            setError(null)
            setProperties([])
            setActiveSourceId(null)
            setSelectedLinkSourceId(null)

            // All sources to initialize: direct + shared with category_property
            const allInitSources = [
                ...(linkedSources || []),
                ...((allSources || []).filter(
                    (s) => !(linkedSources || []).find((ds) => ds.id === s.id) && s.category_property,
                )),
            ]

            if (isEdit && allInitSources.length > 0) {
                const filtersMap: Record<string, SyncFilter[]> = {}
                const catPropsMap: Record<string, string> = {}
                for (const src of allInitSources) {
                    filtersMap[src.id] = src.sync_filters || []
                    catPropsMap[src.id] = src.category_property || ''
                }
                setSourceFilters(filtersMap)
                setSourceCategoryProps(catPropsMap)
                // Auto-expand first source
                setActiveSourceId(allInitSources[0].id)
                loadPropertiesForSource(allInitSources[0].id)
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, category])

    const loadPropertiesForSource = async (sourceId: string) => {
        setLoadingProps(true)
        try {
            const props = await getSourceProperties(sourceId)
            if (Array.isArray(props)) {
                setProperties(props)
            } else if (props?.error) {
                setError(`Failed to load properties: ${props.error}`)
            }
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoadingProps(false)
        }
    }

    const handleSourceTabClick = (sourceId: string) => {
        setActiveSourceId(sourceId)
        loadPropertiesForSource(sourceId)
    }

    // Filter helpers for the active source
    const activeFilters = activeSourceId ? (sourceFilters[activeSourceId] || []) : []

    const addFilter = () => {
        if (!activeSourceId) return
        setSourceFilters({
            ...sourceFilters,
            [activeSourceId]: [...activeFilters, { property: '', type: '', condition: '', value: '' }],
        })
    }

    const removeFilter = (idx: number) => {
        if (!activeSourceId) return
        setSourceFilters({
            ...sourceFilters,
            [activeSourceId]: activeFilters.filter((_, i) => i !== idx),
        })
    }

    const updateFilter = (idx: number, updates: Partial<SyncFilter>) => {
        if (!activeSourceId) return
        setSourceFilters({
            ...sourceFilters,
            [activeSourceId]: activeFilters.map((f, i) => (i === idx ? { ...f, ...updates } : f)),
        })
    }

    const handleSave = async () => {
        if (!name.trim()) { setError('Name is required'); return }
        setSaving(true)
        setError(null)

        // 1) Save category
        const data = { name: name.trim(), color, icon: icon || undefined }
        const result = isEdit
            ? await updateCategory(category!.id, data)
            : await createCategory(data)

        if (result.error) {
            setError(result.error)
            setSaving(false)
            return
        }

        // 2) Save source filters for each working source (edit mode only)
        //    This includes directly linked sources AND shared sources the user configured
        if (isEdit) {
            for (const src of sources) {
                const filters = sourceFilters[src.id] || []
                const catProp = sourceCategoryProps[src.id] || ''

                const validFilters = filters.filter(
                    (f) => f.property && f.type && f.condition,
                )
                const currentFilters = src.sync_filters || []
                const currentCatProp = src.category_property || ''

                const filtersChanged = JSON.stringify(validFilters) !== JSON.stringify(currentFilters)
                const catPropChanged = (catProp === '__none' ? '' : catProp) !== currentCatProp

                if (filtersChanged || catPropChanged) {
                    const srcResult = await updateSource(src.id, {
                        sync_filters: validFilters,
                        category_property: catProp && catProp !== '__none' ? catProp : null,
                    })
                    if (srcResult.error) {
                        setError(`Saved category but failed to update source filters: ${srcResult.error}`)
                        setSaving(false)
                        return
                    }
                }
            }
        }

        onSaved()
        setSaving(false)
    }

    // Get select-type properties for category mapping
    const selectProperties = properties.filter(
        (p) => p.type === 'select' || p.type === 'multi_select' || p.type === 'status',
    )

    // Filterable property types
    const filterableTypes = new Set([
        'checkbox', 'select', 'multi_select', 'status', 'rich_text',
        'number', 'date', 'title', 'priority', 'tags',
    ])
    const filterableProperties = properties.filter((p) => filterableTypes.has(p.type))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={isEdit || hasLinkedSources ? 'sm:max-w-2xl max-h-[90vh] overflow-y-auto' : 'sm:max-w-md'}>
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit Category' : 'New Category'}</DialogTitle>
                    <DialogDescription>
                        {isEdit
                            ? 'Update category details and configure sync filters.'
                            : 'Create a new category for your board.'}
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <Alert className="bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {!isEdit ? (
                    /* ── Create mode: simple form, no tabs ── */
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input placeholder="e.g. Personal, Work, Side Projects" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Color</Label>
                            <div className="flex flex-wrap gap-2">
                                {CATEGORY_COLORS.map((c) => (
                                    <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: c }} />
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Icon (optional emoji)</Label>
                            <Input placeholder="📁" value={icon} onChange={(e) => setIcon(e.target.value)} className="w-20" />
                        </div>
                    </div>
                ) : (
                    /* ── Edit mode: tabbed layout ── */
                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="w-full grid grid-cols-4">
                            <TabsTrigger value="general" className="text-xs gap-1.5">
                                <Settings2 className="h-3.5 w-3.5" />
                                General
                            </TabsTrigger>
                            <TabsTrigger value="skills" className="text-xs gap-1.5">
                                <Brain className="h-3.5 w-3.5" />
                                Skills
                                {(linkedSkills || []).length > 0 && (
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-0.5">{(linkedSkills || []).length}</Badge>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="knowledge" className="text-xs gap-1.5">
                                <BookOpen className="h-3.5 w-3.5" />
                                Knowledge
                            </TabsTrigger>
                            <TabsTrigger value="integration" className="text-xs gap-1.5">
                                <Link2 className="h-3.5 w-3.5" />
                                Integration
                                {sources.length > 0 && (
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-0.5">{sources.length}</Badge>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        {/* ── Tab: General ── */}
                        <TabsContent value="general" className="space-y-4 mt-4">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input placeholder="e.g. Personal, Work, Side Projects" value={name} onChange={(e) => setName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Color</Label>
                                <div className="flex flex-wrap gap-2">
                                    {CATEGORY_COLORS.map((c) => (
                                        <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: c }} />
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Icon (optional emoji)</Label>
                                <Input placeholder="📁" value={icon} onChange={(e) => setIcon(e.target.value)} className="w-20" />
                            </div>
                        </TabsContent>

                        {/* ── Tab: Skills ── */}
                        <TabsContent value="skills" className="space-y-4 mt-4">
                            <div>
                                <p className="text-xs text-muted-foreground">
                                    Skills linked to this category are used as AI instructions when working on its tasks.
                                </p>
                            </div>

                            {editLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                    <span className="text-sm text-muted-foreground">Loading skills...</span>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {(linkedSkills || []).map((skill) => (
                                            <div key={skill.id} className="flex items-center gap-1.5 text-xs rounded-md px-2 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                                <Brain className="h-3 w-3" />
                                                <span>{skill.name}</span>
                                                <button onClick={() => onUnlinkSkill?.(skill.id)} className="hover:text-red-400 transition-colors ml-1" title={`Unlink ${skill.name}`}>
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                        {(!linkedSkills || linkedSkills.length === 0) && (
                                            <div className="w-full text-center py-6 border border-dashed rounded-lg bg-accent/30">
                                                <Brain className="h-6 w-6 text-muted-foreground mx-auto mb-1.5" />
                                                <p className="text-xs text-muted-foreground">No skills linked yet.</p>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">Use the picker below to add skills.</p>
                                            </div>
                                        )}
                                    </div>

                                    {(() => {
                                        const linkedIds = new Set((linkedSkills || []).map(s => s.id))
                                        const available = (allSkills || []).filter(s => !linkedIds.has(s.id) && s.is_active)
                                        if (available.length === 0) return null
                                        return (
                                            <Select value="" onValueChange={(v) => { if (v) onLinkSkill?.(v) }}>
                                                <SelectTrigger className="h-9 text-xs w-full">
                                                    <SelectValue placeholder="+ Add a skill to this category..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {available.map((skill) => (
                                                        <SelectItem key={skill.id} value={skill.id}>
                                                            <div className="flex items-center gap-2">
                                                                <Brain className="h-3 w-3 text-indigo-400" />
                                                                <span>{skill.name}</span>
                                                                {skill.description && (
                                                                    <span className="text-muted-foreground text-[10px] truncate max-w-48">— {skill.description}</span>
                                                                )}
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )
                                    })()}
                                </>
                            )}
                        </TabsContent>

                        {/* ── Tab: Knowledge ── */}
                        <TabsContent value="knowledge" className="space-y-4 mt-4">
                            <div>
                                <p className="text-xs text-muted-foreground">
                                    Master knowledge docs linked to this category provide context to the AI.
                                </p>
                            </div>

                            {editLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                    <span className="text-sm text-muted-foreground">Loading knowledge docs...</span>
                                </div>
                            ) : (() => {
                                const catDocs = (allKnowledgeDocs || []).filter((d) => d.category_id === category?.id)
                                const masterDoc = catDocs.find((d) => d.is_master)
                                const otherDocs = catDocs.filter((d) => !d.is_master)

                                if (catDocs.length === 0) {
                                    return (
                                        <div className="text-center py-6 border border-dashed rounded-lg bg-accent/30">
                                            <BookOpen className="h-6 w-6 text-muted-foreground mx-auto mb-1.5" />
                                            <p className="text-xs text-muted-foreground">No knowledge docs linked to this category.</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">Go to Knowledge Base to create and assign docs to this category.</p>
                                        </div>
                                    )
                                }

                                return (
                                    <div className="space-y-2">
                                        {masterDoc && (
                                            <div className="flex items-center gap-2 text-xs rounded-md px-3 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                <BookOpen className="h-3.5 w-3.5" />
                                                <span className="font-medium">{masterDoc.title}</span>
                                                <Badge className="text-[9px] px-1 py-0 bg-emerald-600/20 text-emerald-400 border-emerald-600/30">Master</Badge>
                                            </div>
                                        )}
                                        {otherDocs.map((doc) => (
                                            <div key={doc.id} className="flex items-center gap-2 text-xs rounded-md px-3 py-2 bg-accent/50 text-muted-foreground border border-border">
                                                <BookOpen className="h-3.5 w-3.5" />
                                                <span>{doc.title}</span>
                                            </div>
                                        ))}
                                    </div>
                                )
                            })()}
                        </TabsContent>

                        {/* ── Tab: Integration ── */}
                        <TabsContent value="integration" className="space-y-4 mt-4">
                            {(hasLinkedSources || hasAvailableSources) ? (
                                <>
                                    <p className="text-xs text-muted-foreground">
                                        {hasLinkedSources
                                            ? 'Configure which tasks sync from your external source.'
                                            : 'Link this category to an existing integration to sync tasks.'}
                                    </p>

                                    {/* If no sources at all, show picker for other available sources */}
                                    {sources.length === 0 && hasAvailableSources && !selectedLinkSourceId && (
                                        <div className="space-y-2">
                                            <Select
                                                value=""
                                                onValueChange={(v) => {
                                                    setSelectedLinkSourceId(v)
                                                    const src = otherAvailableSources.find((s) => s.id === v)
                                                    if (src) {
                                                        setSourceFilters({ ...sourceFilters, [v]: src.sync_filters || [] })
                                                        setSourceCategoryProps({ ...sourceCategoryProps, [v]: src.category_property || '' })
                                                        setActiveSourceId(v)
                                                        loadPropertiesForSource(v)
                                                    }
                                                }}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a source to configure..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {otherAvailableSources.map((src) => (
                                                        <SelectItem key={src.id} value={src.id}>
                                                            <div className="flex items-center gap-2">
                                                                <span>{src.provider === 'notion' ? '📝' : '⚡'}</span>
                                                                <span className="capitalize">{src.provider}</span>
                                                                {src.categories && (
                                                                    <span className="text-muted-foreground text-xs">(linked to {src.categories.name})</span>
                                                                )}
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    {/* Source tabs (if multiple) */}
                                    {sources.length > 1 && (
                                        <div className="flex gap-2">
                                            {sources.map((src) => {
                                                const isShared = !directSources.find((ds) => ds.id === src.id)
                                                return (
                                                    <Button key={src.id} variant={activeSourceId === src.id ? 'default' : 'outline'} size="sm" onClick={() => handleSourceTabClick(src.id)} className={`text-xs ${isShared ? 'border-dashed' : ''}`}>
                                                        {src.provider === 'notion' ? '📝' : '⚡'} {src.provider}
                                                        {isShared && <span className="text-muted-foreground ml-1">(shared)</span>}
                                                    </Button>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {/* Source info badge */}
                                    {activeSourceId && (() => {
                                        const activeSrc = sources.find(s => s.id === activeSourceId)
                                        const isShared = !directSources.find((ds) => ds.id === activeSourceId)
                                        return (
                                            <div className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 ${isShared ? 'bg-accent/50 border border-dashed border-border' : 'bg-accent'}`}>
                                                <span>{activeSrc?.provider === 'notion' ? '📝' : '⚡'}</span>
                                                <span className="capitalize font-medium">{activeSrc?.provider}</span>
                                                <span className="text-muted-foreground">{isShared ? 'shared source' : 'source connected'}</span>
                                                {isShared && activeSrc?.categories && (
                                                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">via {activeSrc.categories.name}</Badge>
                                                )}
                                                {activeSrc?.sync_status === 'syncing' && (
                                                    <Badge variant="secondary" className="text-[10px]"><Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />Syncing</Badge>
                                                )}
                                            </div>
                                        )
                                    })()}

                                    {loadingProps ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                            <span className="text-sm text-muted-foreground">Loading properties from {sources.find(s => s.id === activeSourceId)?.provider}...</span>
                                        </div>
                                    ) : activeSourceId && properties.length > 0 ? (
                                        <div className="space-y-5">
                                            {/* Category Property Mapping */}
                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">Category Property Mapping</Label>
                                                <p className="text-xs text-muted-foreground">Which property auto-assigns tasks to categories?</p>
                                                <Select
                                                    value={sourceCategoryProps[activeSourceId] || '__none'}
                                                    onValueChange={(v) => setSourceCategoryProps({ ...sourceCategoryProps, [activeSourceId]: v })}
                                                >
                                                    <SelectTrigger className="h-9">
                                                        <SelectValue placeholder="Select a property..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="__none">None (use source default)</SelectItem>
                                                        {selectProperties.map((p) => (
                                                            <SelectItem key={p.id} value={p.name}>
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant="outline" className="text-[10px] px-1 py-0">{p.type}</Badge>
                                                                    {p.name}
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Pre-Filters */}
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <Label className="text-xs font-medium flex items-center gap-1.5">
                                                            <Filter className="h-3.5 w-3.5" />
                                                            Sync Filters
                                                        </Label>
                                                        <p className="text-xs text-muted-foreground mt-0.5">Only sync tasks matching ALL conditions below.</p>
                                                    </div>
                                                    <Button variant="outline" size="sm" onClick={addFilter} className="h-7 text-xs">
                                                        <Plus className="h-3 w-3 mr-1" />
                                                        Add Filter
                                                    </Button>
                                                </div>

                                                {activeFilters.length === 0 && (
                                                    <div className="text-center py-4 border border-dashed rounded-lg bg-accent/30">
                                                        <Filter className="h-6 w-6 text-muted-foreground mx-auto mb-1.5" />
                                                        <p className="text-xs text-muted-foreground">No filters — all tasks will be synced</p>
                                                        <Button variant="ghost" size="sm" onClick={addFilter} className="mt-2 h-7 text-xs">
                                                            <Plus className="h-3 w-3 mr-1" />
                                                            Add your first filter
                                                        </Button>
                                                    </div>
                                                )}

                                                <div className="space-y-2">
                                                    {activeFilters.map((filter, idx) => (
                                                        <FilterRow key={idx} filter={filter} properties={filterableProperties} onChange={(updates) => updateFilter(idx, updates)} onRemove={() => removeFilter(idx)} />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : activeSourceId && properties.length === 0 && !loadingProps ? (
                                        <div className="text-center py-6 border border-dashed rounded-lg">
                                            <XCircle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                                            <p className="text-sm text-muted-foreground">Could not load properties from source</p>
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                <div className="text-center py-6 border border-dashed rounded-lg bg-accent/30">
                                    <Link2 className="h-6 w-6 text-muted-foreground mx-auto mb-1.5" />
                                    <p className="text-xs text-muted-foreground">No integrations configured.</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Go to Integrations to connect an external source.</p>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {isEdit ? 'Save Changes' : 'Create Category'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================================
// Source Filter Dialog (Pre-Filters + Category Property Mapping)
// ============================================================================

function SourceFilterDialog({ source, open, onOpenChange, onSaved }: {
    source: Source
    open: boolean
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}) {
    const [properties, setProperties] = useState<SourceProperty[]>([])
    const [loadingProps, setLoadingProps] = useState(true)
    const [filters, setFilters] = useState<SyncFilter[]>(source.sync_filters || [])
    const [categoryProperty, setCategoryProperty] = useState<string>(source.category_property || '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            setFilters(source.sync_filters || [])
            setCategoryProperty(source.category_property || '')
            setError(null)
            loadProperties()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const loadProperties = async () => {
        setLoadingProps(true)
        try {
            const props = await getSourceProperties(source.id)
            if (Array.isArray(props)) {
                setProperties(props)
            } else if (props?.error) {
                setError(props.error)
            }
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoadingProps(false)
        }
    }

    const addFilter = () => {
        setFilters([...filters, { property: '', type: '', condition: '', value: '' }])
    }

    const removeFilter = (idx: number) => {
        setFilters(filters.filter((_, i) => i !== idx))
    }

    const updateFilter = (idx: number, updates: Partial<SyncFilter>) => {
        setFilters(filters.map((f, i) => (i === idx ? { ...f, ...updates } : f)))
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)

        // Validate filters
        const validFilters = filters.filter(
            (f) => f.property && f.type && f.condition,
        )

        const result = await updateSource(source.id, {
            sync_filters: validFilters,
            category_property: categoryProperty && categoryProperty !== '__none' ? categoryProperty : null,
        })

        if (result.error) {
            setError(result.error)
        } else {
            onSaved()
        }
        setSaving(false)
    }

    // Get select-type properties for category mapping
    const selectProperties = properties.filter(
        (p) => p.type === 'select' || p.type === 'multi_select' || p.type === 'status',
    )

    // Filterable property types
    const filterableTypes = new Set([
        'checkbox', 'select', 'multi_select', 'status', 'rich_text',
        'number', 'date', 'title', 'priority', 'tags',
    ])
    const filterableProperties = properties.filter((p) => filterableTypes.has(p.type))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span>{source.provider === 'notion' ? '📝' : '⚡'}</span>
                        Configure {source.provider === 'notion' ? 'Notion' : 'ClickUp'} Source
                    </DialogTitle>
                    <DialogDescription>
                        Map properties and set pre-filters to control which tasks sync.
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <Alert className="bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {loadingProps ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">Loading properties from {source.provider}...</span>
                    </div>
                ) : (
                    <div className="space-y-6 py-2">
                        {/* Category Property Mapping */}
                        <div className="space-y-3">
                            <div>
                                <Label className="text-sm font-semibold">Category Property Mapping</Label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Which property in {source.provider === 'notion' ? 'Notion' : 'ClickUp'} maps to your OTT categories?
                                    When a task&apos;s property value matches a category name, it will be auto-assigned.
                                </p>
                            </div>
                            <Select value={categoryProperty} onValueChange={setCategoryProperty}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a property..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none">None (use source default)</SelectItem>
                                    {selectProperties.map((p) => (
                                        <SelectItem key={p.id} value={p.name}>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                                    {p.type}
                                                </Badge>
                                                {p.name}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {categoryProperty && categoryProperty !== '__none' && (
                                <div className="text-xs text-muted-foreground bg-accent rounded-md p-2">
                                    Values of <strong>{categoryProperty}</strong> will be matched to your OTT category names.
                                    {(() => {
                                        const prop = properties.find((p) => p.name === categoryProperty)
                                        if (prop?.options) {
                                            return (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {prop.options.map((o) => (
                                                        <Badge key={o.name} variant="secondary" className="text-[10px]">
                                                            {o.name}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )
                                        }
                                        return null
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Pre-Filters */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-sm font-semibold">Sync Pre-Filters</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Only sync tasks matching ALL these conditions. Leave empty to sync all tasks.
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" onClick={addFilter}>
                                    <Plus className="h-3.5 w-3.5 mr-1" />
                                    Add Filter
                                </Button>
                            </div>

                            {filters.length === 0 && (
                                <div className="text-center py-6 border border-dashed rounded-lg">
                                    <Filter className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        No filters — all tasks will be synced
                                    </p>
                                </div>
                            )}

                            <div className="space-y-2">
                                {filters.map((filter, idx) => (
                                    <FilterRow
                                        key={idx}
                                        filter={filter}
                                        properties={filterableProperties}
                                        onChange={(updates) => updateFilter(idx, updates)}
                                        onRemove={() => removeFilter(idx)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving || loadingProps}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Save Configuration
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================================
// Filter Row Component
// ============================================================================

function FilterRow({ filter, properties, onChange, onRemove }: {
    filter: SyncFilter
    properties: SourceProperty[]
    onChange: (updates: Partial<SyncFilter>) => void
    onRemove: () => void
}) {
    const selectedProp = properties.find((p) => p.name === filter.property)
    const propType = selectedProp?.type || filter.type || ''
    const conditions = FILTER_CONDITIONS[propType] || []
    const needsValue = filter.condition && !['is_empty', 'is_not_empty'].includes(filter.condition)
    const hasOptions = selectedProp?.options && selectedProp.options.length > 0

    return (
        <div className="flex items-center gap-2 bg-accent/50 rounded-lg p-2 border border-border">
            {/* Property selector */}
            <Select
                value={filter.property}
                onValueChange={(v) => {
                    const prop = properties.find((p) => p.name === v)
                    onChange({
                        property: v,
                        type: prop?.type || '',
                        condition: '',
                        value: '',
                    })
                }}
            >
                <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue placeholder="Property..." />
                </SelectTrigger>
                <SelectContent>
                    {properties.map((p) => (
                        <SelectItem key={p.id} value={p.name}>
                            <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="text-[9px] px-1 py-0">
                                    {p.type}
                                </Badge>
                                <span className="text-xs">{p.name}</span>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Condition selector */}
            <Select
                value={filter.condition}
                onValueChange={(v) => onChange({ condition: v, value: '' })}
                disabled={!filter.property}
            >
                <SelectTrigger className="w-36 h-8 text-xs">
                    <SelectValue placeholder="Condition..." />
                </SelectTrigger>
                <SelectContent>
                    {conditions.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                            {c.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Value input */}
            {needsValue && (
                <>
                    {propType === 'checkbox' ? (
                        <Select
                            value={filter.value === true || filter.value === 'true' ? 'true' : filter.value === false || filter.value === 'false' ? 'false' : ''}
                            onValueChange={(v) => onChange({ value: v === 'true' })}
                        >
                            <SelectTrigger className="w-28 h-8 text-xs">
                                <SelectValue placeholder="Value..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="true">Checked</SelectItem>
                                <SelectItem value="false">Unchecked</SelectItem>
                            </SelectContent>
                        </Select>
                    ) : hasOptions ? (
                        <Select
                            value={filter.value != null && filter.value !== '' ? String(filter.value) : ''}
                            onValueChange={(v) => onChange({ value: v })}
                        >
                            <SelectTrigger className="w-44 h-8 text-xs">
                                <SelectValue placeholder="Select value..." />
                            </SelectTrigger>
                            <SelectContent>
                                {selectedProp?.options?.map((o) => (
                                    <SelectItem key={o.name || String(o.value)} value={o.name || String(o.value)}>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                                                style={{ backgroundColor: notionColorToCSS(o.color) }}
                                            />
                                            <span className="text-xs">{o.name}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : propType === 'date' ? (
                        <Input
                            className="w-36 h-8 text-xs"
                            type="date"
                            value={filter.value || ''}
                            onChange={(e) => onChange({ value: e.target.value })}
                        />
                    ) : (
                        <Input
                            className="w-36 h-8 text-xs"
                            placeholder="Value..."
                            value={filter.value || ''}
                            onChange={(e) => {
                                const v = propType === 'number' ? Number(e.target.value) : e.target.value
                                onChange({ value: v })
                            }}
                        />
                    )}
                </>
            )}

            {/* Remove */}
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
                onClick={onRemove}
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    )
}
