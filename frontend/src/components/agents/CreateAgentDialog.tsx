'use client'

import { useState } from 'react'
import { Bot, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateAgent } from '@/hooks/use-agents'
import type { AgentType, CreateAgentInput } from '@/types/agent'

const AGENT_TYPES: { value: AgentType; label: string; description: string }[] = [
    { value: 'worker', label: 'Worker', description: 'Processes tasks in board columns' },
    { value: 'pilot', label: 'Pilot', description: 'Pod or workspace-level coordinator' },
    { value: 'coordinator', label: 'Coordinator', description: 'Decomposes goals into task DAGs' },
]

const COLOR_PRESETS = [
    '#7C3AED', '#6366F1', '#0EA5E9', '#10B981', '#F59E0B',
    '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
]

interface CreateAgentDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated?: () => void
}

export function CreateAgentDialog({ open, onOpenChange, onCreated }: CreateAgentDialogProps) {
    const [step, setStep] = useState(0)
    const [form, setForm] = useState<CreateAgentInput>({
        name: '',
        description: '',
        persona: '',
        color: '#7C3AED',
        agent_type: 'worker',
        max_concurrent_tasks: 3,
    })
    const [error, setError] = useState<string | null>(null)

    const createMutation = useCreateAgent()

    const handleNext = () => setStep((s) => Math.min(s + 1, 2))
    const handleBack = () => setStep((s) => Math.max(s - 1, 0))

    const handleCreate = async () => {
        if (!form.name.trim()) {
            setError('Name is required')
            return
        }
        setError(null)
        try {
            await createMutation.mutateAsync(form)
            onOpenChange(false)
            setStep(0)
            setForm({ name: '', description: '', persona: '', color: '#7C3AED', agent_type: 'worker', max_concurrent_tasks: 3 })
            onCreated?.()
        } catch (e: any) {
            setError(e?.message ?? 'Failed to create agent')
        }
    }

    const handleClose = () => {
        onOpenChange(false)
        setStep(0)
        setError(null)
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Bot className="w-5 h-5 text-primary" />
                        Create Agent
                        <span className="text-xs text-muted-foreground font-normal ml-auto">
                            Step {step + 1} of 3
                        </span>
                    </DialogTitle>
                </DialogHeader>

                {/* Step progress */}
                <div className="flex gap-1 mb-4">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-border'}`}
                        />
                    ))}
                </div>

                {step === 0 && (
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="agent-name">Name *</Label>
                            <Input
                                id="agent-name"
                                placeholder="e.g. Atlas, Nova, Sentinel"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                className="mt-1"
                                autoFocus
                            />
                        </div>

                        <div>
                            <Label htmlFor="agent-description">Description</Label>
                            <Input
                                id="agent-description"
                                placeholder="Brief role description"
                                value={form.description ?? ''}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label>Color</Label>
                            <div className="flex gap-2 mt-1 flex-wrap">
                                {COLOR_PRESETS.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setForm((f) => ({ ...f, color: c }))}
                                        className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${form.color === c ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <Label>Type</Label>
                            <div className="grid grid-cols-3 gap-2 mt-1">
                                {AGENT_TYPES.map((t) => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setForm((f) => ({ ...f, agent_type: t.value }))}
                                        className={`p-2 rounded-lg border text-left transition-colors ${
                                            form.agent_type === t.value
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-border hover:bg-accent'
                                        }`}
                                    >
                                        <div className="text-xs font-semibold">{t.label}</div>
                                        <div className="text-[10px] text-muted-foreground mt-0.5">{t.description}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="agent-persona">Persona (System Prompt)</Label>
                            <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                                Instructions that define this agent&apos;s behavior and expertise.
                            </p>
                            <Textarea
                                id="agent-persona"
                                placeholder={`You are ${form.name || 'Atlas'}, a meticulous research agent who always cites sources and provides confidence levels...`}
                                value={form.persona ?? ''}
                                onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
                                rows={6}
                                className="resize-none"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            You can link skills and knowledge docs to this agent after creation.
                        </p>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="max-tasks">Max Concurrent Tasks</Label>
                            <Input
                                id="max-tasks"
                                type="number"
                                min={1}
                                max={20}
                                value={form.max_concurrent_tasks ?? 3}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, max_concurrent_tasks: parseInt(e.target.value) || 3 }))
                                }
                                className="mt-1 w-24"
                            />
                        </div>

                        {/* Summary */}
                        <div className="rounded-lg border border-border p-4 space-y-2 bg-accent/30">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Summary</p>
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm"
                                    style={{ backgroundColor: `${form.color ?? '#6366f1'}25`, color: form.color ?? '#6366f1' }}
                                >
                                    {form.name.slice(0, 2).toUpperCase() || '??'}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">{form.name || 'Unnamed Agent'}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{form.agent_type} agent</p>
                                </div>
                            </div>
                            {form.description && (
                                <p className="text-xs text-muted-foreground">{form.description}</p>
                            )}
                        </div>
                    </div>
                )}

                {error && (
                    <p className="text-sm text-destructive">{error}</p>
                )}

                <div className="flex justify-between pt-2">
                    <Button
                        variant="ghost"
                        onClick={step === 0 ? handleClose : handleBack}
                        disabled={createMutation.isPending}
                    >
                        {step === 0 ? 'Cancel' : (
                            <>
                                <ChevronLeft className="w-4 h-4 mr-1" />
                                Back
                            </>
                        )}
                    </Button>

                    {step < 2 ? (
                        <Button onClick={handleNext} disabled={step === 0 && !form.name.trim()}>
                            Next
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    ) : (
                        <Button onClick={handleCreate} disabled={createMutation.isPending}>
                            {createMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Agent'
                            )}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
