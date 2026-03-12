'use client'

import { useState } from 'react'
import { X, Plus, GripVertical, Trash2, Link2, Unlink, Sparkles, Bot, Download, Zap, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateBoard, useTemplates, useInstallTemplate } from '@/hooks/use-boards'
import { getCategories } from '@/app/dashboard/settings/categories/actions'
import { getCategorySkillsMap } from '@/app/dashboard/settings/skills/actions'
import { BoardIcon } from '@/lib/board-icon'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { BoardTemplate } from '@/types/board'

const BOARD_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#eab308', '#22c55e', '#06b6d4',
]

const STEP_COLORS = [
    '#71717a', '#3b82f6', '#8b5cf6', '#ec4899',
    '#ef4444', '#f97316', '#eab308', '#22c55e',
]

interface StepItem {
    id: string
    name: string
    color: string
    linked_category_id?: string
    linked_category_name?: string
    linked_category_color?: string
}

let stepIdCounter = 0
function newStepId() {
    return `step-${++stepIdCounter}-${Date.now()}`
}

const DEFAULT_STEPS: StepItem[] = [
    { id: newStepId(), name: 'To-Do', color: '#71717a' },
    { id: newStepId(), name: 'In Progress', color: '#3b82f6' },
    { id: newStepId(), name: 'Done', color: '#22c55e' },
]

type DialogTab = 'templates' | 'blank'

// ─── Template Card ─────────────────────────────────────────────

function TemplateCard({
    template,
    onInstall,
    installing,
}: {
    template: BoardTemplate
    onInstall: (t: BoardTemplate) => void
    installing: boolean
}) {
    const manifest = template.manifest
    const steps = manifest?.steps || []
    const categories = (manifest as any)?.categories || []
    const totalSkills = categories.reduce(
        (acc: number, c: any) => acc + (c.skills?.length || 0),
        0,
    )

    return (
        <div className="group border border-border rounded-xl p-4 hover:border-primary/30 hover:bg-accent/20 transition-all">
            {/* Header */}
            <div className="flex items-start gap-3 mb-3">
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                        backgroundColor: `${template.color}20`,
                        color: template.color,
                    }}
                >
                    <BoardIcon name={template.icon} className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold truncate">{template.name}</h3>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                        {template.description}
                    </p>
                </div>
            </div>

            {/* Steps preview */}
            <div className="flex items-center gap-1 mb-3 overflow-hidden">
                {steps.map((step: any, i: number) => (
                    <div key={step.id} className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/50">
                            <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: step.color || '#71717a' }}
                            />
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {step.name}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
                            <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/30 shrink-0" />
                        )}
                    </div>
                ))}
            </div>

            {/* Stats + Install */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {categories.length > 0 && (
                        <span className="flex items-center gap-1">
                            <Bot className="w-3 h-3" />
                            {categories.length} agent{categories.length !== 1 ? 's' : ''}
                        </span>
                    )}
                    {totalSkills > 0 && (
                        <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {totalSkills} skill{totalSkills !== 1 ? 's' : ''}
                        </span>
                    )}
                    {template.install_count > 0 && (
                        <span className="flex items-center gap-1">
                            <Download className="w-3 h-3" />
                            {template.install_count}
                        </span>
                    )}
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onInstall(template)}
                    disabled={installing}
                >
                    {installing ? 'Installing...' : 'Install'}
                </Button>
            </div>
        </div>
    )
}

// ─── Sortable Step Row ──────────────────────────────────────────

interface SortableStepProps {
    step: StepItem
    index: number
    totalSteps: number
    categories: any[]
    onUpdateName: (id: string, name: string) => void
    onUpdateColor: (id: string, color: string) => void
    onLinkCategory: (id: string, categoryId: string | undefined, name?: string, color?: string) => void
    onRemove: (id: string) => void
}

function SortableStep({
    step,
    index,
    totalSteps,
    categories,
    onUpdateName,
    onUpdateColor,
    onLinkCategory,
    onRemove,
}: SortableStepProps) {
    const [showColorPicker, setShowColorPicker] = useState(false)
    const [showCategoryPicker, setShowCategoryPicker] = useState(false)
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: step.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div ref={setNodeRef} style={style} className={cn('space-y-1', isDragging && 'opacity-50 z-10')}>
            <div className="flex items-center gap-2 group">
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-0.5 shrink-0"
                >
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30" />
                </button>

                {/* Color dot */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="w-3 h-3 rounded-full shrink-0 border border-white/10 hover:scale-125 transition-transform"
                        style={{ backgroundColor: step.color }}
                    />
                    {showColorPicker && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowColorPicker(false)} />
                            <div className="absolute left-0 top-full mt-1 flex gap-1 p-1.5 bg-popover border border-border rounded-lg shadow-lg z-20">
                                {STEP_COLORS.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => {
                                            onUpdateColor(step.id, c)
                                            setShowColorPicker(false)
                                        }}
                                        className={cn(
                                            'w-5 h-5 rounded-full border-2 hover:scale-110 transition-all',
                                            step.color === c ? 'border-white' : 'border-transparent',
                                        )}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <Input
                    value={step.name}
                    onChange={(e) => onUpdateName(step.id, e.target.value)}
                    className="h-8 text-xs"
                />

                {/* Category link button */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                        className={cn(
                            'p-1 transition-all shrink-0',
                            step.linked_category_id
                                ? 'text-primary hover:text-primary/80'
                                : 'text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100',
                        )}
                        title={step.linked_category_id ? 'Change linked category' : 'Link a category'}
                    >
                        <Link2 className="w-3.5 h-3.5" />
                    </button>

                    {showCategoryPicker && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowCategoryPicker(false)} />
                            <div className="absolute right-0 top-full mt-1 w-52 bg-popover border border-border rounded-lg shadow-xl z-20 py-1 max-h-52 overflow-y-auto">
                                <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    Link Category
                                </div>
                                {step.linked_category_id && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onLinkCategory(step.id, undefined)
                                            setShowCategoryPicker(false)
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                                    >
                                        <Unlink className="w-3.5 h-3.5" />
                                        Unlink
                                    </button>
                                )}
                                <div className="border-t border-border my-1" />
                                {categories.length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-muted-foreground">
                                        No categories found
                                    </div>
                                ) : (
                                    categories.map((cat: any) => (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => {
                                                onLinkCategory(step.id, cat.id, cat.name, cat.color)
                                                setShowCategoryPicker(false)
                                            }}
                                            className={cn(
                                                'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors',
                                                step.linked_category_id === cat.id && 'bg-primary/10 text-primary',
                                            )}
                                        >
                                            <span
                                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10"
                                                style={{ backgroundColor: cat.color || '#71717a' }}
                                            />
                                            <span className="truncate">{cat.name}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => onRemove(step.id)}
                    className="p-1 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    disabled={totalSteps <= 1}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Linked category info */}
            {step.linked_category_id && step.linked_category_name && (
                <div className="ml-[30px] flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                    <Sparkles className="w-3 h-3 text-primary/60" />
                    <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: step.linked_category_color || '#71717a' }}
                    />
                    <span className="text-primary/70 font-medium">{step.linked_category_name}</span>
                    <span>— inherits AI config</span>
                </div>
            )}
        </div>
    )
}

// ─── Main Dialog ────────────────────────────────────────────────

interface CreateBoardDialogProps {
    open: boolean
    onClose: () => void
}

export function CreateBoardDialog({ open, onClose }: CreateBoardDialogProps) {
    const router = useRouter()
    const createBoard = useCreateBoard()
    const installTemplate = useInstallTemplate()
    const [activeTab, setActiveTab] = useState<DialogTab>('templates')
    const [installingId, setInstallingId] = useState<string | null>(null)
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [color, setColor] = useState(BOARD_COLORS[0])
    const [icon, setIcon] = useState('')
    const [steps, setSteps] = useState<StepItem[]>(() => DEFAULT_STEPS.map((s) => ({ ...s })))
    const [newStepName, setNewStepName] = useState('')
    const [defaultCategoryId, setDefaultCategoryId] = useState<string | undefined>()
    const [showAgentPicker, setShowAgentPicker] = useState(false)

    const { data: templates = [], isLoading: templatesLoading } = useTemplates()

    const { data: categories = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: () => getCategories(),
        enabled: open && activeTab === 'blank',
    })

    const { data: categorySkillsMap = {} } = useQuery({
        queryKey: ['categorySkillsMap'],
        queryFn: () => getCategorySkillsMap(),
        enabled: open && activeTab === 'blank',
    })

    // Categories that have at least one skill linked = "agents"
    const agentCategories = categories.filter(
        (cat: any) => categorySkillsMap[cat.id] && categorySkillsMap[cat.id].length > 0
    )

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    )

    if (!open) return null

    const handleInstallTemplate = async (template: BoardTemplate) => {
        setInstallingId(template.id)
        try {
            const result = await installTemplate.mutateAsync({
                template_id: template.id,
            })
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`"${template.name}" installed`)
                reset()
                if (result.board) {
                    router.push(`/dashboard/boards/${result.board.id}`)
                }
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to install template')
        } finally {
            setInstallingId(null)
        }
    }

    const handleAddStep = () => {
        const stepName = newStepName.trim()
        if (!stepName) return
        setSteps([...steps, { id: newStepId(), name: stepName, color: '#71717a' }])
        setNewStepName('')
    }

    const handleRemoveStep = (id: string) => {
        if (steps.length <= 1) return
        setSteps(steps.filter((s) => s.id !== id))
    }

    const handleUpdateName = (id: string, name: string) => {
        setSteps(steps.map((s) => s.id === id ? { ...s, name } : s))
    }

    const handleUpdateColor = (id: string, color: string) => {
        setSteps(steps.map((s) => s.id === id ? { ...s, color } : s))
    }

    const handleLinkCategory = (id: string, categoryId: string | undefined, catName?: string, catColor?: string) => {
        setSteps(steps.map((s) => s.id === id ? {
            ...s,
            linked_category_id: categoryId,
            linked_category_name: catName,
            linked_category_color: catColor,
        } : s))
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const oldIndex = steps.findIndex((s) => s.id === active.id)
        const newIndex = steps.findIndex((s) => s.id === over.id)
        setSteps(arrayMove(steps, oldIndex, newIndex))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        const inlineSteps = steps.map((s, i) => ({
            step_key: s.name.toLowerCase().replace(/\s+/g, '_'),
            name: s.name,
            color: s.color,
            step_type: i === 0 ? 'input' : i === steps.length - 1 ? 'done' : undefined,
            linked_category_id: s.linked_category_id || undefined,
        }))

        try {
            const result = await createBoard.mutateAsync({
                name: name.trim(),
                description: description.trim() || undefined,
                icon: icon || undefined,
                color,
                default_category_id: defaultCategoryId || undefined,
                steps: inlineSteps,
            })

            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Board created')
                reset()
                if (result.board) {
                    router.push(`/dashboard/boards/${result.board.id}`)
                }
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to create board')
        }
    }

    const reset = () => {
        setName('')
        setDescription('')
        setColor(BOARD_COLORS[0])
        setIcon('')
        setDefaultCategoryId(undefined)
        setSteps(DEFAULT_STEPS.map((s) => ({ ...s, id: newStepId() })))
        setNewStepName('')
        setActiveTab('templates')
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl w-[560px] max-h-[85vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-0">
                    <h2 className="text-sm font-bold">New Board</h2>
                    <button
                        onClick={reset}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Tab switcher */}
                <div className="flex items-center gap-1 px-6 pt-3 pb-4">
                    <button
                        onClick={() => setActiveTab('templates')}
                        className={cn(
                            'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                            activeTab === 'templates'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                        )}
                    >
                        Templates
                    </button>
                    <button
                        onClick={() => setActiveTab('blank')}
                        className={cn(
                            'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                            activeTab === 'blank'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                        )}
                    >
                        Blank Board
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
                    {activeTab === 'templates' ? (
                        /* ─── Templates Tab ─────────────────────── */
                        <div className="space-y-3">
                            <p className="text-[11px] text-muted-foreground">
                                Pre-built boards with AI agents, skills, and workflows. Install to get started instantly.
                            </p>

                            {templatesLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                                </div>
                            ) : templates.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-xs text-muted-foreground">No templates available yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {templates.map((template) => (
                                        <TemplateCard
                                            key={template.id}
                                            template={template}
                                            onInstall={handleInstallTemplate}
                                            installing={installingId === template.id}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ─── Blank Board Tab ───────────────────── */
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Name */}
                            <div>
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Board Name
                                </Label>
                                <Input
                                    autoFocus
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Sprint Board, Content Pipeline..."
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Description
                                </Label>
                                <Textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Optional description..."
                                    rows={2}
                                    className="resize-none"
                                />
                            </div>

                            {/* Default Agent */}
                            {agentCategories.length > 0 && (
                                <div>
                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                                        Default Agent
                                    </Label>
                                    <p className="text-[10px] text-muted-foreground/60 mb-2">
                                        Fallback agent for steps without a linked category.
                                    </p>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setShowAgentPicker(!showAgentPicker)}
                                            className={cn(
                                                'w-full flex items-center gap-2 px-3 py-2 h-9 text-xs rounded-md border border-border bg-accent/30 hover:bg-accent/50 transition-colors text-left',
                                                defaultCategoryId && 'border-primary/30'
                                            )}
                                        >
                                            {defaultCategoryId ? (
                                                <>
                                                    <Bot className="w-3.5 h-3.5 text-primary" />
                                                    <span
                                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                                        style={{
                                                            backgroundColor: agentCategories.find((c: any) => c.id === defaultCategoryId)?.color || '#71717a'
                                                        }}
                                                    />
                                                    <span className="truncate">
                                                        {agentCategories.find((c: any) => c.id === defaultCategoryId)?.name || 'Unknown'}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-muted-foreground">None — select an agent...</span>
                                            )}
                                        </button>

                                        {showAgentPicker && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setShowAgentPicker(false)} />
                                                <div className="absolute left-0 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-xl z-20 py-1 max-h-52 overflow-y-auto">
                                                    {defaultCategoryId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setDefaultCategoryId(undefined)
                                                                setShowAgentPicker(false)
                                                            }}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                            Remove default agent
                                                        </button>
                                                    )}
                                                    {defaultCategoryId && <div className="border-t border-border my-1" />}
                                                    {agentCategories.map((cat: any) => (
                                                        <button
                                                            key={cat.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setDefaultCategoryId(cat.id)
                                                                setShowAgentPicker(false)
                                                            }}
                                                            className={cn(
                                                                'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors',
                                                                defaultCategoryId === cat.id && 'bg-primary/10 text-primary',
                                                            )}
                                                        >
                                                            <span
                                                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10"
                                                                style={{ backgroundColor: cat.color || '#71717a' }}
                                                            />
                                                            <span className="truncate">{cat.name}</span>
                                                            <span className="text-[10px] text-muted-foreground ml-auto">
                                                                {categorySkillsMap[cat.id]?.length || 0} skills
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Color + Icon */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                                        Color
                                    </Label>
                                    <div className="flex flex-wrap gap-2">
                                        {BOARD_COLORS.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setColor(c)}
                                                className="w-6 h-6 rounded-full border-2 transition-all"
                                                style={{
                                                    backgroundColor: c,
                                                    borderColor: color === c ? 'white' : 'transparent',
                                                    transform: color === c ? 'scale(1.2)' : 'scale(1)',
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                                        Icon (emoji)
                                    </Label>
                                    <Input
                                        value={icon}
                                        onChange={(e) => setIcon(e.target.value)}
                                        placeholder="e.g. 📋, 🚀, 🎯"
                                        maxLength={2}
                                    />
                                </div>
                            </div>

                            {/* Steps — draggable with category links */}
                            <div>
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                    Steps ({steps.length})
                                </Label>
                                <p className="text-[10px] text-muted-foreground/60 mb-2">
                                    Drag to reorder. Click <Link2 className="w-3 h-3 inline" /> to link a category (inherits AI config).
                                </p>
                                <div className="space-y-1.5">
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <SortableContext
                                            items={steps.map((s) => s.id)}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            {steps.map((step, i) => (
                                                <SortableStep
                                                    key={step.id}
                                                    step={step}
                                                    index={i}
                                                    totalSteps={steps.length}
                                                    categories={categories}
                                                    onUpdateName={handleUpdateName}
                                                    onUpdateColor={handleUpdateColor}
                                                    onLinkCategory={handleLinkCategory}
                                                    onRemove={handleRemoveStep}
                                                />
                                            ))}
                                        </SortableContext>
                                    </DndContext>

                                    {/* Add step */}
                                    <div className="flex items-center gap-2 mt-2">
                                        <div className="w-[18px] shrink-0" />
                                        <div className="w-3 shrink-0" />
                                        <Input
                                            value={newStepName}
                                            onChange={(e) => setNewStepName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    handleAddStep()
                                                }
                                            }}
                                            placeholder="Add a step..."
                                            className="h-8 text-xs"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddStep}
                                            className="p-1 text-muted-foreground hover:text-primary transition-colors shrink-0"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Submit */}
                            <Button
                                type="submit"
                                disabled={!name.trim() || createBoard.isPending}
                                className="w-full"
                            >
                                {createBoard.isPending ? 'Creating...' : 'Create Board'}
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
