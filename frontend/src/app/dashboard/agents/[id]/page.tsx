'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
    Bot, Brain, BookOpen, Link2, Settings2,
    Plus, X, Zap, RefreshCw, Loader2, Save, ChevronRight,
    FileText, ExternalLink, Check, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { BoardIcon } from '@/lib/board-icon'
import { BackbonePicker } from '@/components/backbones/backbone-picker'
import { getCategories, updateCategory } from '@/app/dashboard/settings/categories/actions'
import { PageLayout, PageHeader, PageSidebar, PageContent } from '@/components/page-layout'
import {
    getSkills,
    getSkillsForCategory,
    linkSkillToCategory,
    unlinkSkillFromCategory,
    createSkill,
    updateSkill,
} from '@/app/dashboard/settings/skills/actions'
import { getKnowledgeDocs } from '../../knowledge/actions'
import type { Category } from '@/types/task'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Skill {
    id: string
    name: string
    description: string
    instructions: string
    is_active: boolean
    skill_type?: string
    account_id?: string | null
    created_at: string
    updated_at: string
}

interface KnowledgeDoc {
    id: string
    title: string
    category_id: string | null
    is_master: boolean
    created_at: string
}

const CATEGORY_COLORS = [
    '#22c55e', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
    '#a855f7', '#eab308', '#84cc16', '#38bdf8', '#d946ef',
]

// ─── Skill Editor Drawer ──────────────────────────────────────────────────────

function SkillDrawer({
    skill,
    open,
    onOpenChange,
    onSaved,
}: {
    skill: Skill | null
    open: boolean
    onOpenChange: (v: boolean) => void
    onSaved: (updated: Skill) => void
}) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [instructions, setInstructions] = useState('')
    const [isActive, setIsActive] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (skill) {
            setName(skill.name)
            setDescription(skill.description || '')
            setInstructions(skill.instructions || '')
            setIsActive(skill.is_active)
        }
    }, [skill])

    const handleSave = async () => {
        if (!skill || !name.trim()) return
        setSaving(true)
        try {
            const updated = await updateSkill(skill.id, {
                name: name.trim(),
                description: description.trim() || undefined,
                instructions: instructions.trim(),
                is_active: isActive,
            })
            toast.success('Skill saved')
            onSaved(updated)
            onOpenChange(false)
        } catch (e: any) {
            toast.error(e.message || 'Failed to save skill')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-[520px] sm:max-w-[520px] flex flex-col p-0">
                <SheetHeader className="px-6 py-5 border-b shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                            <Brain className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div>
                            <SheetTitle className="text-base">Edit Skill</SheetTitle>
                            <SheetDescription className="text-xs mt-0.5">
                                {skill?.name}
                            </SheetDescription>
                        </div>
                    </div>
                </SheetHeader>

                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Name</Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Skill name"
                            className="h-9"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Description</Label>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of what this skill does"
                            className="h-9"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Instructions</Label>
                        <p className="text-[11px] text-muted-foreground">
                            Markdown instructions compiled into the agent's SKILL.md and sent to the AI backbone.
                        </p>
                        <Textarea
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            placeholder="Write the AI instructions here... (Markdown supported)"
                            className="min-h-[320px] font-mono text-xs resize-none"
                        />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                        <div>
                            <p className="text-sm font-medium">Active</p>
                            <p className="text-xs text-muted-foreground">Inactive skills are excluded from agent compilation</p>
                        </div>
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>
                </div>

                <div className="shrink-0 px-6 py-4 border-t flex items-center justify-between gap-3">
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                        Save Skill
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}

// ─── Tab Components ───────────────────────────────────────────────────────────

function TabGeneral({
    category,
    onSaved,
}: {
    category: Category & { preferred_backbone_connection_id?: string | null }
    onSaved: (updated: Partial<Category>) => void
}) {
    const [name, setName] = useState(category.name)
    const [color, setColor] = useState(category.color || '#22c55e')
    const [icon, setIcon] = useState(category.icon || '')
    const [backboneId, setBackboneId] = useState<string | null>(
        (category as any).preferred_backbone_connection_id ?? null
    )
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)

    // Track changes
    useEffect(() => {
        const isDirty =
            name !== category.name ||
            color !== (category.color || '#22c55e') ||
            icon !== (category.icon || '') ||
            backboneId !== ((category as any).preferred_backbone_connection_id ?? null)
        setDirty(isDirty)
    }, [name, color, icon, backboneId, category])

    const handleSave = async () => {
        if (!name.trim()) { toast.error('Name is required'); return }
        setSaving(true)
        try {
            const result = await updateCategory(category.id, {
                name: name.trim(),
                color,
                icon: icon || undefined,
                preferred_backbone_connection_id: backboneId ?? undefined,
            })
            if ((result as any).error) {
                toast.error((result as any).error)
            } else {
                toast.success('Agent saved')
                setDirty(false)
                onSaved({ name: name.trim(), color, icon })
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to save')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="space-y-1.5">
                <Label className="text-xs font-medium">Name</Label>
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Personal Secretary, Lead Scout"
                    className="h-9 max-w-sm"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Color</Label>
                <div className="flex flex-wrap gap-2">
                    {CATEGORY_COLORS.map((c) => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            className="w-7 h-7 rounded-full border-2 transition-all relative"
                            style={{ backgroundColor: c, borderColor: color === c ? 'white' : 'transparent' }}
                        >
                            {color === c && (
                                <Check className="w-3 h-3 text-white absolute inset-0 m-auto drop-shadow" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs font-medium">Icon</Label>
                <p className="text-[11px] text-muted-foreground">Lucide icon name (e.g. <code className="bg-muted px-1 rounded">bot</code>, <code className="bg-muted px-1 rounded">shopping-cart</code>) or emoji</p>
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${color}20`, color }}
                    >
                        <BoardIcon name={icon || null} className="w-5 h-5" />
                    </div>
                    <Input
                        value={icon}
                        onChange={(e) => setIcon(e.target.value)}
                        placeholder="bot"
                        className="h-9 w-48"
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs font-medium">AI Backbone</Label>
                <p className="text-[11px] text-muted-foreground">
                    Preferred backbone for this agent. Overrides the board default when routing AI tasks.
                </p>
                <div className="max-w-xs">
                    <BackbonePicker
                        value={backboneId}
                        onChange={setBackboneId}
                        showInheritOption
                        inheritLabel="Inherit from board / account default"
                    />
                </div>
            </div>

            <div className="pt-2">
                <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save Changes
                </Button>
            </div>
        </div>
    )
}

function TabSkills({ categoryId }: { categoryId: string }) {
    const [allSkills, setAllSkills] = useState<Skill[]>([])
    const [linkedSkills, setLinkedSkills] = useState<Skill[]>([])
    const [loading, setLoading] = useState(true)
    const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [newSkillMode, setNewSkillMode] = useState(false)
    const [newSkillName, setNewSkillName] = useState('')
    const [newSkillDesc, setNewSkillDesc] = useState('')
    const [creating, setCreating] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        const [all, linked] = await Promise.all([
            getSkills(true),
            getSkillsForCategory(categoryId),
        ])
        setAllSkills(all || [])
        setLinkedSkills(linked || [])
        setLoading(false)
    }, [categoryId])

    useEffect(() => { load() }, [load])

    const handleLink = async (skillId: string) => {
        try {
            await linkSkillToCategory(skillId, categoryId)
            const skill = allSkills.find((s) => s.id === skillId)
            if (skill) setLinkedSkills((prev) => [...prev, skill])
            toast.success('Skill linked')
        } catch (e: any) {
            toast.error(e.message || 'Failed to link skill')
        }
    }

    const handleUnlink = async (skillId: string) => {
        try {
            await unlinkSkillFromCategory(skillId, categoryId)
            setLinkedSkills((prev) => prev.filter((s) => s.id !== skillId))
            toast.success('Skill unlinked')
        } catch (e: any) {
            toast.error(e.message || 'Failed to unlink skill')
        }
    }

    const handleOpenEdit = (skill: Skill) => {
        setEditingSkill(skill)
        setDrawerOpen(true)
    }

    const handleSkillSaved = (updated: Skill) => {
        setLinkedSkills((prev) => prev.map((s) => s.id === updated.id ? updated : s))
        setAllSkills((prev) => prev.map((s) => s.id === updated.id ? updated : s))
    }

    const handleCreateAndLink = async () => {
        if (!newSkillName.trim()) return
        setCreating(true)
        try {
            const created = await createSkill({
                name: newSkillName.trim(),
                description: newSkillDesc.trim() || undefined,
                instructions: '',
                is_active: true,
            })
            await linkSkillToCategory(created.id, categoryId)
            setAllSkills((prev) => [...prev, created])
            setLinkedSkills((prev) => [...prev, created])
            setNewSkillMode(false)
            setNewSkillName('')
            setNewSkillDesc('')
            toast.success('Skill created and linked')
            // Open the drawer to edit instructions immediately
            setEditingSkill(created)
            setDrawerOpen(true)
        } catch (e: any) {
            toast.error(e.message || 'Failed to create skill')
        } finally {
            setCreating(false)
        }
    }

    const linkedIds = new Set(linkedSkills.map((s) => s.id))
    const available = allSkills.filter((s) => !linkedIds.has(s.id))

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium">Linked Skills</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            These skills are compiled into the agent's instructions and sent to the AI backbone.
                        </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setNewSkillMode(true)}>
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        New Skill
                    </Button>
                </div>

                {/* New skill inline form */}
                {newSkillMode && (
                    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
                        <p className="text-xs font-medium text-indigo-400">Create & Link New Skill</p>
                        <Input
                            placeholder="Skill name *"
                            value={newSkillName}
                            onChange={(e) => setNewSkillName(e.target.value)}
                            className="h-8 text-sm"
                            autoFocus
                        />
                        <Input
                            placeholder="Description (optional)"
                            value={newSkillDesc}
                            onChange={(e) => setNewSkillDesc(e.target.value)}
                            className="h-8 text-sm"
                        />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={handleCreateAndLink} disabled={creating || !newSkillName.trim()}>
                                {creating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                                Create &amp; Link
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setNewSkillMode(false); setNewSkillName(''); setNewSkillDesc('') }}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {/* Linked skills list */}
                {linkedSkills.length === 0 ? (
                    <div className="text-center py-12 border border-dashed rounded-xl bg-accent/20">
                        <Brain className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No skills linked yet</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Create a new skill above or link an existing one below</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {linkedSkills.map((skill) => (
                            <div
                                key={skill.id}
                                className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-indigo-500/30 transition-colors"
                            >
                                <div className="w-7 h-7 rounded-md bg-indigo-500/10 flex items-center justify-center shrink-0">
                                    <Brain className="w-3.5 h-3.5 text-indigo-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{skill.name}</p>
                                    {skill.description && (
                                        <p className="text-xs text-muted-foreground truncate">{skill.description}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!skill.is_active && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-500 border-amber-500/30">
                                            Inactive
                                        </Badge>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => handleOpenEdit(skill)}
                                    >
                                        <FileText className="w-3 h-3 mr-1" />
                                        Edit
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => handleUnlink(skill.id)}
                                    >
                                        <X className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Link existing skill */}
                {available.length > 0 && (
                    <div className="pt-2">
                        <p className="text-[11px] text-muted-foreground mb-2">Link an existing skill</p>
                        <Select value="" onValueChange={(v) => { if (v) handleLink(v) }}>
                            <SelectTrigger className="h-8 text-xs w-full max-w-sm">
                                <SelectValue placeholder="+ Link existing skill..." />
                            </SelectTrigger>
                            <SelectContent>
                                {available.map((skill) => (
                                    <SelectItem key={skill.id} value={skill.id}>
                                        <div className="flex items-center gap-2">
                                            <Brain className="h-3 w-3 text-indigo-400" />
                                            <span>{skill.name}</span>
                                            {skill.description && (
                                                <span className="text-muted-foreground text-[10px] truncate max-w-40">— {skill.description}</span>
                                            )}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            <SkillDrawer
                skill={editingSkill}
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                onSaved={handleSkillSaved}
            />
        </>
    )
}

function TabKnowledge({ categoryId }: { categoryId: string }) {
    const [docs, setDocs] = useState<KnowledgeDoc[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        getKnowledgeDocs().then((all) => {
            setDocs((all || []).filter((d: KnowledgeDoc) => d.category_id === categoryId))
            setLoading(false)
        })
    }, [categoryId])

    const master = docs.find((d) => d.is_master)
    const others = docs.filter((d) => !d.is_master)

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div>
                <p className="text-sm font-medium">Knowledge Base</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Master doc provides persistent context to the AI. Manage docs in the Knowledge Base.
                </p>
            </div>

            {docs.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-xl bg-accent/20">
                    <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No knowledge docs linked</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Create docs in the Knowledge Base and assign them to this agent</p>
                    <Button size="sm" variant="outline" className="mt-4" asChild>
                        <a href="/dashboard/knowledge">
                            <ExternalLink className="w-3 h-3 mr-1.5" />
                            Open Knowledge Base
                        </a>
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    {master && (
                        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                            <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{master.title}</p>
                                <p className="text-[11px] text-emerald-400/80 mt-0.5">Master doc — compiled into agent instructions</p>
                            </div>
                            <Badge className="text-[10px] px-1.5 py-0 bg-emerald-600/20 text-emerald-400 border-emerald-600/30 shrink-0">
                                Master
                            </Badge>
                        </div>
                    )}
                    {others.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                            <p className="text-sm truncate flex-1">{doc.title}</p>
                        </div>
                    ))}
                    <div className="pt-1">
                        <Button size="sm" variant="outline" asChild>
                            <a href="/dashboard/knowledge">
                                <ExternalLink className="w-3 h-3 mr-1.5" />
                                Manage in Knowledge Base
                            </a>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'general' | 'skills' | 'knowledge'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'general', label: 'General', icon: Settings2 },
    { id: 'skills', label: 'Skills', icon: Brain },
    { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
]

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [agent, setAgent] = useState<(Category & { preferred_backbone_connection_id?: string | null }) | null>(null)
    const [allAgents, setAllAgents] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<Tab>('general')

    useEffect(() => {
        getCategories().then((cats) => {
            setAllAgents(cats || [])
            const found = cats.find((c: Category) => c.id === id)
            setAgent(found ?? null)
            setLoading(false)
        })
    }, [id])

    if (loading) {
        return (
            <PageLayout
                header={
                    <PageHeader
                        icon={<Bot className="w-4 h-4 text-primary" />}
                        title="Agents"
                    />
                }
            >
                <div className="flex items-center justify-center flex-1">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            </PageLayout>
        )
    }

    if (!agent) {
        return (
            <PageLayout
                header={
                    <PageHeader
                        icon={<Bot className="w-4 h-4 text-primary" />}
                        title="Agents"
                    />
                }
            >
                <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                    <Bot className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">Agent not found</p>
                    <Button variant="ghost" size="sm" className="mt-3" onClick={() => router.push('/dashboard/agents')}>
                        Back to Agents
                    </Button>
                </div>
            </PageLayout>
        )
    }

    const color = agent.color || '#6366f1'

    return (
        <PageLayout
            header={
                <PageHeader
                    icon={<Bot className="w-4 h-4 text-primary" />}
                    title={
                        <nav className="flex items-center gap-1">
                            <a href="/dashboard/agents" className="text-muted-foreground hover:text-foreground transition-colors font-normal">
                                Agents
                            </a>
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{agent.name}</span>
                        </nav>
                    }
                />
            }
            sidebar={
                <PageSidebar>
                    <div className="px-3 pt-4 pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 mb-2">All Agents</p>
                        {allAgents.map((a) => {
                            const aColor = a.color || '#6366f1'
                            const isActive = a.id === id
                            return (
                                <a
                                    key={a.id}
                                    href={`/dashboard/agents/${a.id}`}
                                    className={cn(
                                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                                        isActive
                                            ? 'bg-accent text-foreground font-medium'
                                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                    )}
                                >
                                    <div
                                        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                                        style={{ backgroundColor: `${aColor}25`, color: aColor }}
                                    >
                                        <BoardIcon name={a.icon} className="w-3 h-3" />
                                    </div>
                                    <span className="truncate text-xs">{a.name}</span>
                                </a>
                            )
                        })}
                    </div>
                </PageSidebar>
            }
        >
            <PageContent className="overflow-y-auto">
                <div className="max-w-2xl mx-auto px-6 py-8">
                    {/* Agent Identity */}
                    <div className="flex items-center gap-4 mb-8">
                        <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${color}20`, color }}
                        >
                            <BoardIcon name={agent.icon} className="w-7 h-7" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">{agent.name}</h1>
                            {agent.description && (
                                <p className="text-sm text-muted-foreground mt-0.5">{agent.description}</p>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 mb-6 border-b border-border">
                        {TABS.map((t) => {
                            const Icon = t.icon
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => setTab(t.id)}
                                    className={cn(
                                        'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                                        tab === t.id
                                            ? 'border-primary text-foreground'
                                            : 'border-transparent text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {t.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Tab Content */}
                    {tab === 'general' && (
                        <TabGeneral
                            category={agent}
                            onSaved={(updates) => setAgent((prev) => prev ? { ...prev, ...updates } : prev)}
                        />
                    )}
                    {tab === 'skills' && (
                        <TabSkills categoryId={agent.id} />
                    )}
                    {tab === 'knowledge' && (
                        <TabKnowledge categoryId={agent.id} />
                    )}
                </div>
            </PageContent>
        </PageLayout>
    )
}
