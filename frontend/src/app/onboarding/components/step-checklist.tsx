'use client'

import { useRouter } from 'next/navigation'
import { Settings, FolderOpen, Bot, Timer, ArrowRight, Loader2 } from 'lucide-react'
import { ChecklistItem } from './checklist-item'
import { LivePreview } from './live-preview'

interface StepChecklistProps {
    sourceConnected: boolean
    connectedProviders: string[]
    categoriesDefined: boolean
    openclawConfigured: boolean
    selectedCategoryNames: string[]
    onConnectSource: () => void
    onDefineCategories: () => void
    onGoToDashboard: () => void
    onSkip: () => void
    isFinishing: boolean
}

export function StepChecklist({
    sourceConnected,
    connectedProviders,
    categoriesDefined,
    openclawConfigured,
    selectedCategoryNames,
    onConnectSource,
    onDefineCategories,
    onGoToDashboard,
    onSkip,
    isFinishing,
}: StepChecklistProps) {
    const router = useRouter()

    const sourceDescription = sourceConnected
        ? `Connected: ${connectedProviders.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')}. Will be linked when you finish setup.`
        : 'Sync your Notion or ClickUp data to import tasks and projects.'

    return (
        <div className="w-full max-w-5xl mx-auto flex gap-6 items-start">
            {/* Main content - left side */}
            <div className="flex-1 min-w-0">
                <div className="mb-8">
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 mb-2">
                        Let&apos;s get your workspace ready
                    </h1>
                    <p className="text-slate-400 text-sm leading-relaxed">
                        Complete these core configuration tasks to unlock the full potential of
                        your productivity suite.
                    </p>
                </div>

                {/* Checklist */}
                <div className="space-y-3 mb-8">
                    <ChecklistItem
                        icon={<Settings className="w-4 h-4" />}
                        label="Connect Integration"
                        description={sourceDescription}
                        status={sourceConnected ? 'completed' : 'pending'}
                        badge={sourceConnected ? 'Token Saved' : 'Optional'}
                        badgeVariant={sourceConnected ? 'completed' : 'info'}
                        actionLabel={sourceConnected ? undefined : 'Connect'}
                        onAction={onConnectSource}
                    />

                    <ChecklistItem
                        icon={<FolderOpen className="w-4 h-4" />}
                        label="Define Agents"
                        description="Create agents to organize your workflow into distinct areas like 'Client Work', 'Internal', and 'Personal'."
                        status={categoriesDefined ? 'completed' : 'required'}
                        badge={categoriesDefined ? 'Completed' : 'Required'}
                        badgeVariant={categoriesDefined ? 'completed' : 'required'}
                        actionLabel={categoriesDefined ? undefined : 'Start'}
                        onAction={onDefineCategories}
                        isActive={!categoriesDefined}
                    />

                    <ChecklistItem
                        icon={<Bot className="w-4 h-4" />}
                        label="Setup OpenClaw API"
                        description="Integrate our proprietary automation engine to handle recurring scheduling tasks."
                        status={openclawConfigured ? 'completed' : 'optional'}
                        badge="Automations"
                        badgeVariant="info"
                        actionLabel={openclawConfigured ? undefined : 'Configure'}
                        onAction={() => router.push('/dashboard/settings/ai-provider')}
                    />

                    <ChecklistItem
                        icon={<Timer className="w-4 h-4" />}
                        label="Link your first task to Pomodoro"
                        description="Connect a specific Notion item to the deep-work timer to track focused hours."
                        status="optional"
                        badge="Learning"
                        badgeVariant="info"
                        actionLabel="Link"
                        onAction={() => router.push('/dashboard/tasks')}
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={onSkip}
                        className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        Skip for now
                    </button>
                    <button
                        onClick={categoriesDefined ? onGoToDashboard : onDefineCategories}
                        disabled={isFinishing}
                        className="h-11 px-6 rounded-lg bg-[#FF4500] text-black font-bold hover:bg-[#E63E00] transition-all flex items-center gap-2 disabled:opacity-50"
                        style={{
                            boxShadow: '0 0 20px rgba(255, 69, 0, 0.2)',
                        }}
                    >
                        {isFinishing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Setting up...
                            </>
                        ) : categoriesDefined ? (
                            <>
                                Go to Dashboard
                                <ArrowRight className="w-4 h-4" />
                            </>
                        ) : (
                            <>
                                Continue
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Live preview - right side (desktop only) */}
            <div className="hidden lg:block shrink-0">
                <LivePreview
                    notionConnected={sourceConnected}
                    categoriesSelected={selectedCategoryNames}
                />
            </div>
        </div>
    )
}
