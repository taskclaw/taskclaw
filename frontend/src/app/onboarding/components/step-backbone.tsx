'use client'

import { useState } from 'react'
import { BrainCircuit, Check, Loader2, ArrowRight, Shield, Zap, Globe } from 'lucide-react'
import { createBackboneConnection, verifyBackboneConnection } from '@/app/dashboard/settings/backbones/actions'

export interface BackboneSetupResult {
    connectionId: string
    name: string
    provider: string
}

interface StepBackboneProps {
    onBackboneReady: (result: BackboneSetupResult) => void
    onSkip: () => void
}

// ── Backbone provider configs ──────────────────────────────────────────────────

const PROVIDERS = [
    {
        slug: 'anthropic',
        label: 'Claude (Anthropic)',
        icon: '🧠',
        color: '#D97706',
        description: 'Most capable — Claude Opus, Sonnet, Haiku',
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'sk-ant-api...', secret: true },
            { key: 'model', label: 'Model (optional)', placeholder: 'claude-sonnet-4-6', secret: false },
        ],
        defaultName: 'Claude (Anthropic)',
        requiresApiKey: true,
    },
    {
        slug: 'openrouter',
        label: 'OpenRouter',
        icon: '🔀',
        color: '#7C3AED',
        description: '100+ models — GPT-4o, Claude, Gemini and more',
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'sk-or-v1-...', secret: true },
            { key: 'model', label: 'Model (optional)', placeholder: 'openai/gpt-4o', secret: false },
        ],
        defaultName: 'OpenRouter',
        requiresApiKey: true,
    },
    {
        slug: 'openclaw',
        label: 'OpenClaw (Self-hosted)',
        icon: '🦞',
        color: '#FF4500',
        description: 'Your own TaskClaw AI server',
        fields: [
            { key: 'api_url', label: 'Server URL', placeholder: 'http://your-server:18789', secret: false },
            { key: 'api_key', label: 'API Key', placeholder: 'abc123...', secret: true },
            { key: 'agent_id', label: 'Agent ID (optional)', placeholder: 'leave empty for default agent', secret: false },
        ],
        defaultName: 'OpenClaw',
        requiresApiKey: true,
    },
    {
        slug: 'ollama',
        label: 'Ollama (Local)',
        icon: '🦙',
        color: '#059669',
        description: 'Free, private — runs on your own machine',
        fields: [
            { key: 'api_url', label: 'Server URL', placeholder: 'http://localhost:11434', secret: false },
            { key: 'model', label: 'Model', placeholder: 'phi3:mini', secret: false },
        ],
        defaultName: 'Ollama',
        requiresApiKey: false,
    },
]

type Stage = 'pick' | 'configure' | 'verifying' | 'success'

// ── Component ──────────────────────────────────────────────────────────────────

export function StepBackbone({ onBackboneReady, onSkip }: StepBackboneProps) {
    const [stage, setStage] = useState<Stage>('pick')
    const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
    const [verifyError, setVerifyError] = useState<string | null>(null)
    const [verifiedResult, setVerifiedResult] = useState<BackboneSetupResult | null>(null)

    const selectedProvider = PROVIDERS.find((p) => p.slug === selectedSlug)

    // ── Handlers ──

    const handlePickProvider = (slug: string) => {
        setSelectedSlug(slug)
        setFieldValues({})
        setVerifyError(null)
        setStage('configure')
    }

    const handleBack = () => {
        setStage('pick')
        setSelectedSlug(null)
        setFieldValues({})
        setVerifyError(null)
    }

    const handleVerify = async () => {
        if (!selectedProvider) return
        setVerifyError(null)
        setStage('verifying')

        try {
            // Build config from field values with defaults
            const config: Record<string, string> = {}
            for (const field of selectedProvider.fields) {
                if (fieldValues[field.key]) {
                    config[field.key] = fieldValues[field.key]
                }
            }
            // Fill in default api_url for Ollama if empty
            if (selectedSlug === 'ollama' && !config.api_url) {
                config.api_url = 'http://localhost:11434'
            }
            if (selectedSlug === 'ollama' && !config.model) {
                config.model = 'phi3:mini'
            }

            // Create the backbone connection via server action
            const createResult = await createBackboneConnection({
                backbone_type: selectedProvider.slug,
                name: selectedProvider.defaultName,
                config,
                is_default: true,
            })

            if (createResult.error) {
                setVerifyError(createResult.error || 'Failed to save backbone connection')
                setStage('configure')
                return
            }

            const connectionId = createResult.data?.id
            if (!connectionId) {
                setVerifyError('Backbone saved but could not retrieve ID')
                setStage('configure')
                return
            }

            // Verify the connection health via server action
            const verifyResult = await verifyBackboneConnection(connectionId)

            if (verifyResult.error) {
                setVerifyError(verifyResult.error || 'Connection verification failed. Check your credentials.')
                setStage('configure')
                return
            }

            const result: BackboneSetupResult = {
                connectionId,
                name: selectedProvider.defaultName,
                provider: selectedProvider.slug,
            }
            setVerifiedResult(result)
            setStage('success')
        } catch (err: any) {
            setVerifyError(err.message || 'Network error during verification')
            setStage('configure')
        }
    }

    const canVerify = () => {
        if (!selectedProvider) return false
        for (const field of selectedProvider.fields) {
            if (field.key === 'model') continue // optional
            if (field.key === 'api_url' && selectedSlug === 'ollama') continue // has default
            if (selectedProvider.requiresApiKey && field.key === 'api_key' && !fieldValues[field.key]?.trim()) {
                return false
            }
        }
        return true
    }

    // ── Render: Pick stage ──

    if (stage === 'pick') {
        return (
            <div className="w-full max-w-lg mx-auto">
                <div className="text-center mb-8">
                    <div
                        className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
                        style={{
                            background: 'radial-gradient(circle, rgba(255,69,0,0.2) 0%, rgba(255,69,0,0.05) 100%)',
                            boxShadow: '0 0 40px rgba(255, 69, 0, 0.15)',
                        }}
                    >
                        <BrainCircuit className="w-8 h-8 text-[#FF4500]" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-50">
                        Connect your AI Brain
                    </h1>
                    <p className="text-slate-400 mt-2 text-sm leading-relaxed max-w-sm mx-auto">
                        TaskClaw needs an AI backbone to power your agents. Pick one to get started — you can add more later.
                    </p>
                </div>

                {/* Provider grid */}
                <div className="space-y-3 mb-6">
                    {PROVIDERS.map((provider) => (
                        <button
                            key={provider.slug}
                            onClick={() => handlePickProvider(provider.slug)}
                            className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#334155] bg-[#1E293B] hover:border-[#FF4500]/50 hover:bg-[#1E293B]/80 transition-all text-left group"
                        >
                            <div
                                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                                style={{ backgroundColor: `${provider.color}20`, border: `1px solid ${provider.color}40` }}
                            >
                                {provider.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-50">{provider.label}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{provider.description}</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-[#FF4500] transition-colors shrink-0" />
                        </button>
                    ))}
                </div>

                {/* Trust badges */}
                <div className="flex items-center justify-center gap-6 text-xs text-slate-600 mb-6">
                    <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> Keys stored encrypted</span>
                    <span className="flex items-center gap-1.5"><Zap className="w-3 h-3" /> Verified in 2s</span>
                    <span className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> Add more later</span>
                </div>

                {/* Skip */}
                <button
                    onClick={onSkip}
                    className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                    Skip for now (you won't be able to use AI features)
                </button>
            </div>
        )
    }

    // ── Render: Configure stage ──

    if (stage === 'configure' && selectedProvider) {
        return (
            <div className="w-full max-w-md mx-auto">
                <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-8">
                    {/* Provider header */}
                    <div className="flex items-center gap-3 mb-6">
                        <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                            style={{ backgroundColor: `${selectedProvider.color}20`, border: `1px solid ${selectedProvider.color}40` }}
                        >
                            {selectedProvider.icon}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-50">{selectedProvider.label}</h2>
                            <p className="text-xs text-slate-500">{selectedProvider.description}</p>
                        </div>
                    </div>

                    {/* Error */}
                    {verifyError && (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 mb-4">
                            {verifyError}
                        </div>
                    )}

                    {/* Fields */}
                    <div className="space-y-4 mb-6">
                        {selectedProvider.fields.map((field) => (
                            <div key={field.key}>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    {field.label}
                                    {field.key === 'model' && <span className="text-slate-600 font-normal ml-1">(optional)</span>}
                                </label>
                                <input
                                    type={field.secret ? 'password' : 'text'}
                                    placeholder={field.placeholder}
                                    value={fieldValues[field.key] || ''}
                                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                    autoFocus={field.key === selectedProvider.fields[0].key}
                                    className="w-full h-11 px-4 rounded-lg bg-[#0F172A] border border-[#334155] text-slate-50 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#FF4500]/50 focus:border-[#FF4500] text-sm"
                                />
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleBack}
                            className="flex-1 h-11 rounded-lg border border-[#334155] text-slate-400 font-medium hover:bg-slate-800 transition-colors"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleVerify}
                            disabled={!canVerify()}
                            className="flex-2 h-11 px-6 rounded-lg bg-[#FF4500] text-black font-bold hover:bg-[#E63E00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            Verify & Continue
                            <Zap className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // ── Render: Verifying stage ──

    if (stage === 'verifying') {
        return (
            <div className="w-full max-w-md mx-auto text-center">
                <div className="flex flex-col items-center gap-5">
                    <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center"
                        style={{
                            background: 'radial-gradient(circle, rgba(255,69,0,0.15) 0%, rgba(255,69,0,0.05) 100%)',
                            boxShadow: '0 0 40px rgba(255, 69, 0, 0.15)',
                        }}
                    >
                        <Loader2 className="w-10 h-10 text-[#FF4500] animate-spin" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-50">Connecting to {selectedProvider?.label}…</h2>
                        <p className="text-slate-400 text-sm mt-1">Verifying credentials and testing connection</p>
                    </div>
                </div>
            </div>
        )
    }

    // ── Render: Success stage ──

    if (stage === 'success' && verifiedResult) {
        return (
            <div className="w-full max-w-md mx-auto text-center">
                <div className="flex flex-col items-center gap-5">
                    <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center"
                        style={{
                            background: 'radial-gradient(circle, rgba(0,255,148,0.15) 0%, rgba(0,255,148,0.05) 100%)',
                            boxShadow: '0 0 40px rgba(0, 255, 148, 0.2)',
                        }}
                    >
                        <Check className="w-10 h-10 text-[#00FF94]" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-50">AI Brain Connected!</h2>
                        <p className="text-slate-400 text-sm mt-1">
                            <span className="text-[#00FF94] font-medium">{verifiedResult.name}</span> is ready to power your agents.
                        </p>
                    </div>
                    <button
                        onClick={() => onBackboneReady(verifiedResult)}
                        className="h-12 px-8 rounded-lg bg-[#FF4500] text-black font-bold hover:bg-[#E63E00] transition-all flex items-center gap-2"
                        style={{ boxShadow: '0 0 20px rgba(255, 69, 0, 0.25)' }}
                    >
                        Continue Setup
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        )
    }

    return null
}
