'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
    getDefaultCategories,
    createBulkCategories,
    createSource,
    seedDefaultBoards,
    completeOnboarding,
} from './actions'
import { OnboardingLayout } from './components/onboarding-layout'
import { StepBackbone, type BackboneSetupResult } from './components/step-backbone'
import { StepCategories } from './components/step-categories'
import { StepBoards } from './components/step-boards'
import { StepIntegrations } from './components/step-integrations'
import type { DefaultCategory } from './components/category-card'

// ============================================================================
// New Onboarding Flow — 4 steps
//   1. Backbone   — pick + verify an AI provider (required to unlock chat)
//   2. Agents     — choose categories / AI agent roles
//   3. Boards     — auto-seed Personal + Professional boards (shown briefly)
//   4. Integrations — quick-connect Notion, ClickUp, Telegram, Brave (optional)
// ============================================================================

interface PendingIntegration {
    id: string
    token: string
}

export default function OnboardingPage() {
    const router = useRouter()
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

    // Step 1 state
    const [backboneResult, setBackboneResult] = useState<BackboneSetupResult | null>(null)

    // Step 2 state
    const [defaultCategories, setDefaultCategories] = useState<DefaultCategory[]>([])
    const [categoriesDefined, setCategoriesDefined] = useState(false)
    const [createdCategoryId, setCreatedCategoryId] = useState<string | null>(null)
    const [isFinishingCategories, setIsFinishingCategories] = useState(false)

    // Step 3 is auto (board seeding happens in onboarding actions)

    // Step 4 state
    const [isFinishing, setIsFinishing] = useState(false)

    const [completing, setCompleting] = useState(false)

    // Fetch default categories on mount
    useEffect(() => {
        async function fetchDefaults() {
            const cats = await getDefaultCategories()
            if (cats && cats.length > 0) {
                setDefaultCategories(cats)
            } else {
                setDefaultCategories([
                    { name: 'Personal Life', color: '#EC4899', icon: 'Heart' },
                    { name: 'Year Goals Tasks', color: '#F97316', icon: 'Target' },
                    { name: 'Work', color: '#3B82F6', icon: 'Briefcase' },
                    { name: 'Studies', color: '#8B5CF6', icon: 'BookOpen' },
                ])
            }
        }
        fetchDefaults()
    }, [])

    // Completion %
    const completionPercentage = (() => {
        const weights = [25, 50, 75, 100]
        return weights[step - 1] ?? 0
    })()

    // ── Step 1: Backbone done ──
    const handleBackboneReady = (result: BackboneSetupResult) => {
        setBackboneResult(result)
        setStep(2)
    }

    const handleBackboneSkip = () => {
        setStep(2)
    }

    // ── Step 2: Categories done → go to boards ──
    const handleFinishWithCategories = async (categories: DefaultCategory[]) => {
        setIsFinishingCategories(true)
        try {
            if (categories.length > 0) {
                const result = await createBulkCategories(categories)
                if (result && Array.isArray(result) && result.length > 0) {
                    setCreatedCategoryId(result[0].id)
                } else if (result && !result.error && result.id) {
                    setCreatedCategoryId(result.id)
                }
            }
            setCategoriesDefined(true)
        } catch {
            setCategoriesDefined(true)
        } finally {
            setIsFinishingCategories(false)
            setStep(3)
        }
    }

    const handleCategoryBack = () => {
        setStep(1)
    }

    // ── Step 3: Boards seeded → go to integrations ──
    const handleBoardsContinue = () => {
        setStep(4)
    }

    // ── Step 4: Integrations done → complete onboarding ──
    const handleIntegrationsContinue = async (integrations: PendingIntegration[]) => {
        setIsFinishing(true)
        setCompleting(true)

        // Seed default boards first — this is the most important step
        try {
            await seedDefaultBoards()
        } catch {
            // Board seeding failing is non-fatal — user can create boards manually
        }

        // Create sources for connected integrations (best-effort)
        if (integrations.length > 0 && createdCategoryId) {
            for (const integration of integrations) {
                try {
                    await createSource({
                        provider: integration.id,
                        category_id: createdCategoryId,
                        config: { api_key: integration.token },
                        sync_interval_minutes: 15,
                    })
                } catch {
                    // Source creation failing is non-fatal
                }
            }
        }

        // Store progress
        if (typeof window !== 'undefined') {
            localStorage.setItem('onboarding_progress', JSON.stringify({
                backbone_configured: !!backboneResult,
                backbone_provider: backboneResult?.provider || null,
                source_connected: integrations.length > 0,
                categories_defined: categoriesDefined,
            }))
        }

        try { await completeOnboarding() } catch { /* ignore */ }
        router.push('/dashboard/tasks')
    }

    return (
        <OnboardingLayout step={step} totalSteps={4} completionPercentage={completionPercentage}>
            {/* Step 1: AI Backbone */}
            {step === 1 && (
                <StepBackbone
                    onBackboneReady={handleBackboneReady}
                    onSkip={handleBackboneSkip}
                />
            )}

            {/* Step 2: Agent / Category customization */}
            {step === 2 && (
                <StepCategories
                    defaultCategories={defaultCategories}
                    onFinish={handleFinishWithCategories}
                    onBack={handleCategoryBack}
                    isFinishing={isFinishingCategories}
                />
            )}

            {/* Step 3: Default boards created */}
            {step === 3 && (
                <StepBoards onContinue={handleBoardsContinue} />
            )}

            {/* Step 4: Quick-connect integrations */}
            {step === 4 && (
                <StepIntegrations
                    onContinue={handleIntegrationsContinue}
                    isFinishing={isFinishing}
                />
            )}

            {/* Completing overlay */}
            {completing && (
                <div className="fixed inset-0 bg-[#0F172A]/90 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
                        <p className="text-lg font-medium text-slate-50">
                            Setting up your workspace…
                        </p>
                        <p className="text-sm text-slate-400">
                            Creating boards and linking everything together
                        </p>
                    </div>
                </div>
            )}
        </OnboardingLayout>
    )
}
