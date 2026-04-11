'use client'

import { useState } from 'react'
import { Check, Loader2, ArrowRight, ExternalLink } from 'lucide-react'

interface IntegrationItem {
    id: string
    name: string
    icon: string
    color: string
    description: string
    fieldLabel: string
    fieldPlaceholder: string
    fieldSecret: boolean
    helpUrl?: string
    helpLabel?: string
}

const INTEGRATIONS: IntegrationItem[] = [
    {
        id: 'notion',
        name: 'Notion',
        icon: 'N',
        color: '#ffffff',
        description: 'Sync pages, databases, and tasks',
        fieldLabel: 'Integration Token',
        fieldPlaceholder: 'ntn_xxxxxxxxxxxxx',
        fieldSecret: true,
        helpUrl: 'https://www.notion.so/my-integrations',
        helpLabel: 'notion.so/my-integrations',
    },
    {
        id: 'clickup',
        name: 'ClickUp',
        icon: 'C',
        color: '#7B68EE',
        description: 'Import tasks and projects',
        fieldLabel: 'Personal Token',
        fieldPlaceholder: 'pk_xxxxxxxxxxxxx',
        fieldSecret: true,
        helpUrl: 'https://app.clickup.com/settings/apps',
        helpLabel: 'clickup.com/settings/apps',
    },
    {
        id: 'telegram',
        name: 'Telegram Bot',
        icon: '✈️',
        color: '#2AABEE',
        description: 'Get AI notifications via Telegram',
        fieldLabel: 'Bot Token',
        fieldPlaceholder: '1234567890:AAHxxxxxxxxxxxxxxxx',
        fieldSecret: true,
        helpUrl: 'https://t.me/BotFather',
        helpLabel: 't.me/BotFather',
    },
    {
        id: 'brave',
        name: 'Brave Search',
        icon: '🦁',
        color: '#FB542B',
        description: 'Enable web search in your agents',
        fieldLabel: 'API Key',
        fieldPlaceholder: 'BSAxxxxxxxxxxxxxxxx',
        fieldSecret: true,
        helpUrl: 'https://api.search.brave.com/',
        helpLabel: 'api.search.brave.com',
    },
]

interface ConnectedIntegration {
    id: string
    token: string
}

interface StepIntegrationsProps {
    onContinue: (integrations: ConnectedIntegration[]) => void
    isFinishing: boolean
}

export function StepIntegrations({ onContinue, isFinishing }: StepIntegrationsProps) {
    const [connected, setConnected] = useState<ConnectedIntegration[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    const [tokenValue, setTokenValue] = useState('')
    const [error, setError] = useState<string | null>(null)

    const isConnected = (id: string) => connected.some((c) => c.id === id)

    const handleOpenForm = (id: string) => {
        setActiveId(id)
        setTokenValue('')
        setError(null)
    }

    const handleSave = () => {
        if (!activeId) return
        if (!tokenValue.trim()) {
            setError('Please enter the token')
            return
        }
        setConnected((prev) => {
            const filtered = prev.filter((c) => c.id !== activeId)
            return [...filtered, { id: activeId, token: tokenValue.trim() }]
        })
        setActiveId(null)
        setTokenValue('')
    }

    const handleDisconnect = (id: string) => {
        setConnected((prev) => prev.filter((c) => c.id !== id))
    }

    const activeIntegration = INTEGRATIONS.find((i) => i.id === activeId)

    return (
        <div className="w-full max-w-lg mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-50">
                    Connect your tools
                </h1>
                <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                    Optional — connect the tools you use to supercharge your agents. You can do this anytime from Settings.
                </p>
            </div>

            {/* Active form */}
            {activeId && activeIntegration && (
                <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 mb-4">
                    <div className="flex items-center gap-3 mb-4">
                        <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white"
                            style={{ backgroundColor: activeIntegration.color === '#ffffff' ? '#333' : activeIntegration.color }}
                        >
                            {activeIntegration.icon}
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-50">{activeIntegration.name}</p>
                            <p className="text-xs text-slate-500">{activeIntegration.description}</p>
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 mb-3">
                            {error}
                        </div>
                    )}

                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        {activeIntegration.fieldLabel}
                    </label>
                    <input
                        type={activeIntegration.fieldSecret ? 'password' : 'text'}
                        placeholder={activeIntegration.fieldPlaceholder}
                        value={tokenValue}
                        onChange={(e) => setTokenValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                        autoFocus
                        className="w-full h-10 px-3 rounded-lg bg-[#0F172A] border border-[#334155] text-slate-50 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#FF4500]/50 focus:border-[#FF4500] text-sm mb-3"
                    />

                    {activeIntegration.helpUrl && (
                        <p className="text-xs text-slate-500 mb-4">
                            Get your token at{' '}
                            <a href={activeIntegration.helpUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[#FF4500] hover:underline inline-flex items-center gap-0.5">
                                {activeIntegration.helpLabel}
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        </p>
                    )}

                    <div className="flex gap-2">
                        <button onClick={() => setActiveId(null)}
                            className="flex-1 h-9 rounded-lg border border-[#334155] text-slate-400 text-sm hover:bg-slate-800 transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={!tokenValue.trim()}
                            className="flex-1 h-9 rounded-lg bg-[#FF4500] text-black text-sm font-bold hover:bg-[#E63E00] transition-colors disabled:opacity-50">
                            Save
                        </button>
                    </div>
                </div>
            )}

            {/* Integration list */}
            <div className="space-y-2 mb-8">
                {INTEGRATIONS.map((integration) => {
                    const conn = isConnected(integration.id)
                    return (
                        <div key={integration.id}
                            className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${conn
                                ? 'border-[#00FF94]/30 bg-[#00FF94]/5'
                                : 'border-[#334155] bg-[#1E293B]'
                            }`}>
                            <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
                                style={{ backgroundColor: integration.color === '#ffffff' ? '#333' : integration.color }}
                            >
                                {integration.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-50">{integration.name}</p>
                                <p className="text-xs text-slate-500">{integration.description}</p>
                            </div>
                            {conn ? (
                                <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1 text-xs text-[#00FF94] font-medium">
                                        <Check className="w-3.5 h-3.5" />
                                        Connected
                                    </span>
                                    <button onClick={() => handleDisconnect(integration.id)}
                                        className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                                        Remove
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => handleOpenForm(integration.id)}
                                    disabled={!!activeId && activeId !== integration.id}
                                    className="text-xs font-medium text-slate-400 hover:text-[#FF4500] transition-colors border border-[#334155] hover:border-[#FF4500]/50 px-3 py-1.5 rounded-lg disabled:opacity-40"
                                >
                                    Connect
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Continue CTA */}
            <button
                onClick={() => onContinue(connected)}
                disabled={isFinishing}
                className="w-full h-12 rounded-lg bg-[#FF4500] text-black font-bold hover:bg-[#E63E00] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ boxShadow: '0 0 20px rgba(255, 69, 0, 0.2)' }}
            >
                {isFinishing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Finishing setup…</>
                ) : (
                    <>
                        {connected.length > 0 ? `Continue with ${connected.length} integration${connected.length > 1 ? 's' : ''}` : 'Finish Setup'}
                        <ArrowRight className="w-4 h-4" />
                    </>
                )}
            </button>

            {connected.length === 0 && (
                <p className="text-center text-xs text-slate-500 mt-3">
                    You can connect integrations anytime from Settings → Integrations
                </p>
            )}
        </div>
    )
}
