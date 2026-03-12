'use client'

import { useState } from 'react'
import {
    X,
    Sparkles,
    Zap,
    Play,
    Clock,
    Webhook,
    Hand,
    Plus,
    Trash2,
    ArrowRight,
    AlertTriangle,
    Save,
    Loader2,
    Globe,
    KeyRound,
    Settings2,
    MessageSquare,
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateBoardStep } from '@/app/dashboard/boards/actions'
import type { BoardStep, SchemaField } from '@/types/board'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const TRIGGER_OPTIONS = [
    { value: 'on_entry', label: 'On Entry', icon: Play, desc: 'Auto-execute when card enters this step' },
    { value: 'manual', label: 'Manual', icon: Hand, desc: 'User triggers execution manually' },
    { value: 'schedule', label: 'Schedule', icon: Clock, desc: 'Run on a time interval' },
    { value: 'webhook', label: 'Webhook', icon: Webhook, desc: 'Triggered by external webhook' },
] as const

const FIELD_TYPES = ['text', 'number', 'boolean', 'date', 'url', 'email', 'json', 'dropdown'] as const

const SCHEDULE_PRESETS = [
    { label: 'Every 5 min', cron: '*/5 * * * *' },
    { label: 'Every 15 min', cron: '*/15 * * * *' },
    { label: 'Every 30 min', cron: '*/30 * * * *' },
    { label: 'Every hour', cron: '0 * * * *' },
    { label: 'Every 6 hours', cron: '0 */6 * * *' },
    { label: 'Every 12 hours', cron: '0 */12 * * *' },
    { label: 'Daily at midnight', cron: '0 0 * * *' },
    { label: 'Daily at 9 AM', cron: '0 9 * * *' },
    { label: 'Weekly (Mon 9 AM)', cron: '0 9 * * 1' },
    { label: 'Monthly (1st at 9 AM)', cron: '0 9 1 * *' },
] as const

type Tab = 'settings' | 'prompt'

interface StepConfigDrawerProps {
    boardId: string
    step: BoardStep
    allSteps: BoardStep[]
    onClose: () => void
}

export function StepConfigDrawer({ boardId, step, allSteps, onClose }: StepConfigDrawerProps) {
    const qc = useQueryClient()
    const [activeTab, setActiveTab] = useState<Tab>('settings')

    // Settings state
    const [triggerType, setTriggerType] = useState<string>(step.trigger_type || 'on_entry')
    const [aiFirst, setAiFirst] = useState(step.ai_first || false)
    const [inputSchema, setInputSchema] = useState<SchemaField[]>(step.input_schema || [])
    const [outputSchema, setOutputSchema] = useState<SchemaField[]>(step.output_schema || [])
    const [onSuccessStepId, setOnSuccessStepId] = useState<string | null>(step.on_success_step_id)
    const [onErrorStepId, setOnErrorStepId] = useState<string | null>(step.on_error_step_id)
    const [webhookUrl, setWebhookUrl] = useState(step.webhook_url || '')
    const [webhookAuthHeader, setWebhookAuthHeader] = useState(step.webhook_auth_header || '')
    const [scheduleCron, setScheduleCron] = useState(step.schedule_cron || '')

    // System prompt state
    const [systemPrompt, setSystemPrompt] = useState(step.system_prompt || '')

    const otherSteps = allSteps.filter((s) => s.id !== step.id)
    const hasCategory = !!step.linked_category_id

    const isDirty =
        triggerType !== (step.trigger_type || 'on_entry')
        || aiFirst !== (step.ai_first || false)
        || JSON.stringify(inputSchema) !== JSON.stringify(step.input_schema || [])
        || JSON.stringify(outputSchema) !== JSON.stringify(step.output_schema || [])
        || onSuccessStepId !== step.on_success_step_id
        || onErrorStepId !== step.on_error_step_id
        || webhookUrl !== (step.webhook_url || '')
        || webhookAuthHeader !== (step.webhook_auth_header || '')
        || scheduleCron !== (step.schedule_cron || '')
        || systemPrompt !== (step.system_prompt || '')

    const canSave = isDirty && !(triggerType === 'webhook' && !webhookUrl.trim())

    const saveConfig = useMutation({
        mutationFn: async () => {
            const result = await updateBoardStep(boardId, step.id, {
                trigger_type: triggerType,
                ai_first: aiFirst,
                input_schema: inputSchema,
                output_schema: outputSchema,
                on_success_step_id: onSuccessStepId,
                on_error_step_id: onErrorStepId,
                webhook_url: triggerType === 'webhook' ? webhookUrl || null : null,
                webhook_auth_header: triggerType === 'webhook' ? webhookAuthHeader || null : null,
                schedule_cron: triggerType === 'schedule' ? scheduleCron || null : null,
                system_prompt: systemPrompt || null,
            })
            if (result.error) throw new Error(result.error)
            return result
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['board', boardId] })
            qc.invalidateQueries({ queryKey: ['boards'] })
            toast.success('Step config saved')
            onClose()
        },
        onError: (e: Error) => toast.error(e.message),
    })

    // Schema helpers
    const addField = (target: 'input' | 'output') => {
        const newField: SchemaField = { key: '', label: '', type: 'text', required: false }
        if (target === 'input') setInputSchema([...inputSchema, newField])
        else setOutputSchema([...outputSchema, newField])
    }

    const updateField = (target: 'input' | 'output', index: number, updates: Partial<SchemaField>) => {
        if (target === 'input') {
            setInputSchema(inputSchema.map((f, i) => i === index ? { ...f, ...updates } : f))
        } else {
            setOutputSchema(outputSchema.map((f, i) => i === index ? { ...f, ...updates } : f))
        }
    }

    const removeField = (target: 'input' | 'output', index: number) => {
        if (target === 'input') setInputSchema(inputSchema.filter((_, i) => i !== index))
        else setOutputSchema(outputSchema.filter((_, i) => i !== index))
    }

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Drawer */}
            <div className="fixed right-0 top-0 bottom-0 z-50 w-[520px] max-w-[95vw] bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-200">
                {/* Header */}
                <div className="px-6 pt-4 pb-0 border-b border-border shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: step.color || '#71717a' }}
                            />
                            <div className="min-w-0">
                                <h2 className="text-sm font-bold truncate">{step.name}</h2>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                    {step.step_type} step config
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-0">
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
                                activeTab === 'settings'
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <Settings2 className="w-3.5 h-3.5" />
                            Settings
                        </button>
                        <button
                            onClick={() => setActiveTab('prompt')}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
                                activeTab === 'prompt'
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                            System Prompt
                            {systemPrompt && (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    {activeTab === 'settings' ? (
                        <SettingsTab
                            step={step}
                            hasCategory={hasCategory}
                            triggerType={triggerType}
                            setTriggerType={setTriggerType}
                            aiFirst={aiFirst}
                            setAiFirst={setAiFirst}
                            inputSchema={inputSchema}
                            outputSchema={outputSchema}
                            addField={addField}
                            updateField={updateField}
                            removeField={removeField}
                            onSuccessStepId={onSuccessStepId}
                            setOnSuccessStepId={setOnSuccessStepId}
                            onErrorStepId={onErrorStepId}
                            setOnErrorStepId={setOnErrorStepId}
                            webhookUrl={webhookUrl}
                            setWebhookUrl={setWebhookUrl}
                            webhookAuthHeader={webhookAuthHeader}
                            setWebhookAuthHeader={setWebhookAuthHeader}
                            scheduleCron={scheduleCron}
                            setScheduleCron={setScheduleCron}
                            otherSteps={otherSteps}
                        />
                    ) : (
                        <SystemPromptTab
                            systemPrompt={systemPrompt}
                            setSystemPrompt={setSystemPrompt}
                            hasCategory={hasCategory}
                            categoryName={step.linked_category?.name}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between">
                    <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Cancel
                    </button>
                    <Button
                        size="sm"
                        onClick={() => saveConfig.mutate()}
                        disabled={!canSave || saveConfig.isPending}
                    >
                        {saveConfig.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                            <Save className="w-3.5 h-3.5 mr-1" />
                        )}
                        Save Config
                    </Button>
                </div>
            </div>
        </>
    )
}

// ─── Settings Tab ────────────────────────────────────────────────

interface SettingsTabProps {
    step: BoardStep
    hasCategory: boolean
    triggerType: string
    setTriggerType: (v: string) => void
    aiFirst: boolean
    setAiFirst: (v: boolean) => void
    inputSchema: SchemaField[]
    outputSchema: SchemaField[]
    addField: (target: 'input' | 'output') => void
    updateField: (target: 'input' | 'output', index: number, updates: Partial<SchemaField>) => void
    removeField: (target: 'input' | 'output', index: number) => void
    onSuccessStepId: string | null
    setOnSuccessStepId: (v: string | null) => void
    onErrorStepId: string | null
    setOnErrorStepId: (v: string | null) => void
    webhookUrl: string
    setWebhookUrl: (v: string) => void
    webhookAuthHeader: string
    setWebhookAuthHeader: (v: string) => void
    scheduleCron: string
    setScheduleCron: (v: string) => void
    otherSteps: BoardStep[]
}

function SettingsTab({
    step,
    hasCategory,
    triggerType,
    setTriggerType,
    aiFirst,
    setAiFirst,
    inputSchema,
    outputSchema,
    addField,
    updateField,
    removeField,
    onSuccessStepId,
    setOnSuccessStepId,
    onErrorStepId,
    setOnErrorStepId,
    webhookUrl,
    setWebhookUrl,
    webhookAuthHeader,
    setWebhookAuthHeader,
    scheduleCron,
    setScheduleCron,
    otherSteps,
}: SettingsTabProps) {
    return (
        <div className="px-6 py-5 space-y-6">
            {/* Linked category info */}
            {hasCategory && step.linked_category && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/10">
                    <Sparkles className="w-4 h-4 text-primary shrink-0" />
                    <div className="text-xs">
                        <span className="text-muted-foreground">Linked to </span>
                        <span className="font-semibold text-primary">{step.linked_category.name}</span>
                        <span className="text-muted-foreground"> — inherits Skills & Knowledge</span>
                    </div>
                </div>
            )}

            {/* ─── Trigger Type ─────────────────────────── */}
            <section>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                    Trigger
                </Label>
                <div className="grid grid-cols-2 gap-2">
                    {TRIGGER_OPTIONS.map((opt) => {
                        const Icon = opt.icon
                        const isActive = triggerType === opt.value
                        return (
                            <button
                                key={opt.value}
                                onClick={() => setTriggerType(opt.value)}
                                className={cn(
                                    'flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all',
                                    isActive
                                        ? 'border-primary bg-primary/5 text-foreground'
                                        : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                                )}
                            >
                                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', isActive && 'text-primary')} />
                                <div>
                                    <div className="text-xs font-semibold">{opt.label}</div>
                                    <div className="text-[10px] leading-tight mt-0.5 opacity-70">{opt.desc}</div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </section>

            {/* ─── Webhook Config ──────────────────────── */}
            {triggerType === 'webhook' && (
                <section className="space-y-3 p-3 rounded-lg border border-border bg-accent/10">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Webhook Configuration
                    </Label>
                    <div className="space-y-2">
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium">Webhook URL</span>
                                <span className="text-[9px] text-destructive font-medium">required</span>
                            </div>
                            <Input
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                placeholder="https://example.com/webhook"
                                className={cn(
                                    'h-8 text-xs font-mono',
                                    triggerType === 'webhook' && !webhookUrl.trim() && 'border-destructive/50',
                                )}
                            />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium">Authorization Header</span>
                                <span className="text-[9px] text-muted-foreground/50">optional</span>
                            </div>
                            <Input
                                value={webhookAuthHeader}
                                onChange={(e) => setWebhookAuthHeader(e.target.value)}
                                placeholder="Bearer sk-..."
                                className="h-8 text-xs font-mono"
                            />
                        </div>
                    </div>
                </section>
            )}

            {/* ─── Schedule Config ─────────────────────── */}
            {triggerType === 'schedule' && (
                <section className="space-y-3 p-3 rounded-lg border border-border bg-accent/10">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Schedule Interval
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                        {SCHEDULE_PRESETS.map((preset) => (
                            <button
                                key={preset.cron}
                                onClick={() => setScheduleCron(preset.cron)}
                                className={cn(
                                    'px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-all',
                                    scheduleCron === preset.cron
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                                )}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium">Custom Cron Expression</span>
                        </div>
                        <Input
                            value={scheduleCron}
                            onChange={(e) => setScheduleCron(e.target.value)}
                            placeholder="*/5 * * * *"
                            className="h-8 text-xs font-mono"
                        />
                        {scheduleCron && (
                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                                {describeCron(scheduleCron)}
                            </p>
                        )}
                    </div>
                </section>
            )}

            {/* ─── AI First ───────────────────────────── */}
            {hasCategory && (
                <section className="flex items-center justify-between py-3 border-t border-b border-border">
                    <div>
                        <div className="text-xs font-semibold flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-amber-500" />
                            AI First
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Auto-execute AI when a card enters this step
                        </p>
                    </div>
                    <button
                        onClick={() => setAiFirst(!aiFirst)}
                        className={cn(
                            'relative w-10 h-5 rounded-full transition-colors shrink-0',
                            aiFirst ? 'bg-primary' : 'bg-muted-foreground/20',
                        )}
                    >
                        <span
                            className={cn(
                                'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                                aiFirst && 'translate-x-5',
                            )}
                        />
                    </button>
                </section>
            )}

            {/* ─── Input Schema ────────────────────────── */}
            <section>
                <div className="flex items-center justify-between mb-3">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Mandatory / Optional Inputs
                    </Label>
                    <button
                        onClick={() => addField('input')}
                        className="text-[10px] text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                    >
                        <Plus className="w-3 h-3" /> Add Field
                    </button>
                </div>
                {inputSchema.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/50 italic">No input fields defined</p>
                ) : (
                    <div className="space-y-2">
                        {inputSchema.map((field, i) => (
                            <SchemaFieldRow
                                key={i}
                                field={field}
                                showRequired
                                onChange={(updates) => updateField('input', i, updates)}
                                onRemove={() => removeField('input', i)}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* ─── Output Schema ───────────────────────── */}
            <section>
                <div className="flex items-center justify-between mb-3">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Expected Output / Fields
                    </Label>
                    <button
                        onClick={() => addField('output')}
                        className="text-[10px] text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                    >
                        <Plus className="w-3 h-3" /> Add Field
                    </button>
                </div>
                {outputSchema.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/50 italic">No output fields defined</p>
                ) : (
                    <div className="space-y-2">
                        {outputSchema.map((field, i) => (
                            <SchemaFieldRow
                                key={i}
                                field={field}
                                onChange={(updates) => updateField('output', i, updates)}
                                onRemove={() => removeField('output', i)}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* ─── Move-to Routing ─────────────────────── */}
            <section>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                    Routing
                </Label>
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 w-28 shrink-0">
                            <ArrowRight className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-xs font-medium">On Success</span>
                        </div>
                        <select
                            value={onSuccessStepId || ''}
                            onChange={(e) => setOnSuccessStepId(e.target.value || null)}
                            className="flex-1 h-8 text-xs rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value="">Next column (default)</option>
                            {otherSteps.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 w-28 shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                            <span className="text-xs font-medium">On Error</span>
                        </div>
                        <select
                            value={onErrorStepId || ''}
                            onChange={(e) => setOnErrorStepId(e.target.value || null)}
                            className="flex-1 h-8 text-xs rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value="">Stay in place (default)</option>
                            {otherSteps.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </section>
        </div>
    )
}

// ─── System Prompt Tab ───────────────────────────────────────────

interface SystemPromptTabProps {
    systemPrompt: string
    setSystemPrompt: (v: string) => void
    hasCategory: boolean
    categoryName?: string
}

function SystemPromptTab({ systemPrompt, setSystemPrompt, hasCategory, categoryName }: SystemPromptTabProps) {
    const charCount = systemPrompt.length

    return (
        <div className="px-6 py-5 flex flex-col h-full">
            {hasCategory && categoryName && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10 mb-4">
                    <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="text-xs">
                        <span className="text-muted-foreground">The category </span>
                        <span className="font-semibold text-amber-500">{categoryName}</span>
                        <span className="text-muted-foreground"> may also have its own system prompt. This step-level prompt will be </span>
                        <span className="font-semibold text-foreground">appended</span>
                        <span className="text-muted-foreground"> to the category prompt.</span>
                    </div>
                </div>
            )}

            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                System Prompt
            </Label>
            <p className="text-[10px] text-muted-foreground/60 mb-3">
                Instructions for the AI when processing cards in this step. Define the role, tone, constraints, and expected behavior.
            </p>

            <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={"You are a helpful assistant that processes incoming requests.\n\nFor each card in this step:\n1. Analyze the input fields\n2. Generate the expected output\n3. Follow any constraints defined in the schema"}
                className="flex-1 min-h-[280px] w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/30"
            />

            <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-muted-foreground/40">
                    {charCount > 0 ? `${charCount.toLocaleString()} characters` : 'No prompt set'}
                </span>
                {systemPrompt && (
                    <button
                        onClick={() => setSystemPrompt('')}
                        className="text-[10px] text-muted-foreground/40 hover:text-destructive transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>
        </div>
    )
}

// ─── Schema Field Row ────────────────────────────────────────────

interface SchemaFieldRowProps {
    field: SchemaField
    showRequired?: boolean
    onChange: (updates: Partial<SchemaField>) => void
    onRemove: () => void
}

function SchemaFieldRow({ field, showRequired, onChange, onRemove }: SchemaFieldRowProps) {
    const [newOption, setNewOption] = useState('')

    const addOption = () => {
        const val = newOption.trim()
        if (!val) return
        const current = field.options || []
        if (!current.includes(val)) {
            onChange({ options: [...current, val] })
        }
        setNewOption('')
    }

    const removeOption = (index: number) => {
        const current = field.options || []
        onChange({ options: current.filter((_, i) => i !== index) })
    }

    const renderDefaultValue = () => {
        switch (field.type) {
            case 'dropdown':
                return (
                    <select
                        value={field.default_value || ''}
                        onChange={(e) => onChange({ default_value: e.target.value })}
                        className="h-6 text-[10px] flex-1 rounded-md border border-border bg-background px-2 text-muted-foreground"
                    >
                        <option value="">No default</option>
                        {(field.options || []).map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                )
            case 'boolean':
                return (
                    <select
                        value={field.default_value || ''}
                        onChange={(e) => onChange({ default_value: e.target.value })}
                        className="h-6 text-[10px] flex-1 rounded-md border border-border bg-background px-2 text-muted-foreground"
                    >
                        <option value="">No default</option>
                        <option value="true">True</option>
                        <option value="false">False</option>
                    </select>
                )
            case 'number':
                return (
                    <Input
                        type="number"
                        value={field.default_value || ''}
                        onChange={(e) => onChange({ default_value: e.target.value })}
                        placeholder="Default number (optional)"
                        className="h-6 text-[10px] flex-1 text-muted-foreground"
                    />
                )
            case 'date':
                return (
                    <Input
                        type="date"
                        value={field.default_value || ''}
                        onChange={(e) => onChange({ default_value: e.target.value })}
                        className="h-6 text-[10px] flex-1 text-muted-foreground"
                    />
                )
            case 'url':
                return (
                    <Input
                        type="url"
                        value={field.default_value || ''}
                        onChange={(e) => onChange({ default_value: e.target.value })}
                        placeholder="https://... (optional)"
                        className="h-6 text-[10px] flex-1 text-muted-foreground"
                    />
                )
            case 'email':
                return (
                    <Input
                        type="email"
                        value={field.default_value || ''}
                        onChange={(e) => onChange({ default_value: e.target.value })}
                        placeholder="email@... (optional)"
                        className="h-6 text-[10px] flex-1 text-muted-foreground"
                    />
                )
            default:
                return (
                    <Input
                        value={field.default_value || ''}
                        onChange={(e) => onChange({ default_value: e.target.value })}
                        placeholder="Default value (optional)"
                        className="h-6 text-[10px] flex-1 text-muted-foreground"
                    />
                )
        }
    }

    return (
        <div className="space-y-1.5">
            {/* Main row */}
            <div className="flex items-center gap-2 group">
                <Input
                    value={field.key}
                    onChange={(e) => onChange({ key: e.target.value })}
                    placeholder="key"
                    className="h-7 text-[11px] w-20 font-mono"
                />
                <Input
                    value={field.label}
                    onChange={(e) => onChange({ label: e.target.value })}
                    placeholder="Label"
                    className="h-7 text-[11px] flex-1"
                />
                <select
                    value={field.type}
                    onChange={(e) => {
                        const newType = e.target.value as SchemaField['type']
                        onChange({ type: newType, default_value: '' })
                    }}
                    className="h-7 text-[11px] rounded-md border border-border bg-background px-1.5 w-[82px]"
                >
                    {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                {showRequired && (
                    <label className="flex items-center gap-1 shrink-0 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={field.required || false}
                            onChange={(e) => onChange({ required: e.target.checked })}
                            className="w-3 h-3 rounded border-border"
                        />
                        <span className="text-[9px] text-muted-foreground">Req</span>
                    </label>
                )}
                <button
                    onClick={onRemove}
                    className="p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>

            {/* Dropdown options editor */}
            {field.type === 'dropdown' && (
                <div className="p-2 rounded-md bg-accent/20 border border-border/50 space-y-1.5">
                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        Dropdown Options
                    </div>
                    {(field.options || []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {(field.options || []).map((opt, idx) => (
                                <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium"
                                >
                                    {opt}
                                    <button
                                        onClick={() => removeOption(idx)}
                                        className="hover:text-destructive transition-colors"
                                    >
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-1.5">
                        <Input
                            value={newOption}
                            onChange={(e) => setNewOption(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    addOption()
                                }
                            }}
                            placeholder="Add option..."
                            className="h-6 text-[10px] flex-1"
                        />
                        <button
                            onClick={addOption}
                            disabled={!newOption.trim()}
                            className="p-1 text-primary hover:text-primary/80 disabled:opacity-30 transition-all"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            )}

            {/* Type-aware default value */}
            <div className="flex items-center gap-2">
                {renderDefaultValue()}
            </div>
        </div>
    )
}

// ─── Cron Description Helper ─────────────────────────────────────

function describeCron(cron: string): string {
    const preset = SCHEDULE_PRESETS.find((p) => p.cron === cron)
    if (preset) return preset.label

    const parts = cron.trim().split(/\s+/)
    if (parts.length !== 5) return 'Invalid cron expression'

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

    if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        return `Every ${minute.slice(2)} minutes`
    }
    if (minute !== '*' && hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        return `Every ${hour.slice(2)} hours at minute ${minute}`
    }

    return `Cron: ${cron}`
}
