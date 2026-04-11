'use client'

import { useState, useEffect } from 'react'
import {
    getMemoryConnections,
    createMemoryConnection,
    updateMemoryConnection,
    checkMemoryHealth,
    type MemoryConnection,
} from './actions'
import { getMemoryEntries } from './actions'
import { Brain, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export default function MemorySettingsPage() {
    const [connections, setConnections] = useState<MemoryConnection[]>([])
    const [memoryCount, setMemoryCount] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)
    const [obsidianFormOpen, setObsidianFormOpen] = useState(false)
    const [guideOpen, setGuideOpen] = useState(false)
    const [obsidianConfig, setObsidianConfig] = useState({
        vault_url: '',
        api_key: '',
    })
    const [saving, setSaving] = useState(false)
    const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'healthy' | 'unhealthy'>('idle')

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        setLoading(true)
        try {
            const [conns, entries] = await Promise.all([
                getMemoryConnections(),
                getMemoryEntries({ limit: 1 }),
            ])
            setConnections(conns || [])
            // NOTE: API not yet deployed (BE05). Will show actual count once BE05 is live.
            setMemoryCount(Array.isArray(entries) ? entries.length : 0)

            // Pre-fill Obsidian form if connection exists
            const obsConn = (conns || []).find((c: MemoryConnection) => c.adapter_slug === 'obsidian')
            if (obsConn) {
                setObsidianConfig({
                    vault_url: (obsConn.config?.vault_url as string) || '',
                    api_key: (obsConn.config?.api_key as string) || '',
                })
                setObsidianFormOpen(true)
            }
        } catch {
            // API not ready yet
        } finally {
            setLoading(false)
        }
    }

    const obsidianConnection = connections.find((c) => c.adapter_slug === 'obsidian')
    const defaultConnection = connections.find((c) => c.adapter_slug === 'default')

    async function handleSaveObsidian() {
        if (!obsidianConfig.vault_url.trim()) {
            toast.error('Vault URL is required')
            return
        }
        setSaving(true)
        try {
            const payload = {
                adapter_slug: 'obsidian',
                name: 'Obsidian',
                config: {
                    vault_url: obsidianConfig.vault_url.trim(),
                    api_key: obsidianConfig.api_key.trim(),
                    memory_folder: 'TaskClaw/Memories',
                },
                is_active: true,
            }
            let result
            if (obsidianConnection) {
                result = await updateMemoryConnection(obsidianConnection.id, payload)
            } else {
                result = await createMemoryConnection(payload)
            }
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Obsidian memory connection saved')
                await loadData()
            }
        } finally {
            setSaving(false)
        }
    }

    async function handleHealthCheck() {
        if (!obsidianConnection) {
            toast.error('Save the connection first')
            return
        }
        setHealthStatus('checking')
        const result = await checkMemoryHealth(obsidianConnection.id)
        setHealthStatus(result.healthy ? 'healthy' : 'unhealthy')
        if (result.healthy) {
            toast.success('Obsidian vault is reachable')
        } else {
            toast.error(`Vault unreachable: ${result.error || 'Check your URL and API key'}`)
        }
    }

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 pt-0 max-w-2xl">
            {/* Header */}
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Memory</h2>
                    <p className="text-muted-foreground text-sm">
                        Configure how AI agents store and recall memories across conversations.
                    </p>
                </div>
                <Link href="/dashboard/settings/memory/entries">
                    <Button variant="outline" size="sm">
                        <Activity className="w-4 h-4 mr-1" />
                        View memories
                    </Button>
                </Link>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Default adapter card */}
                    <div className="border rounded-xl p-4 bg-card">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Brain className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-sm">Default (Built-in)</h3>
                                        <Badge variant="secondary" className="text-xs">Active</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Stores episodic, semantic, and procedural memories in your database with vector search.
                                    </p>
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                {memoryCount !== null ? (
                                    <div className="text-sm font-semibold">{memoryCount}</div>
                                ) : (
                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                )}
                                <div className="text-xs text-muted-foreground">memories</div>
                            </div>
                        </div>
                    </div>

                    {/* Obsidian adapter card */}
                    <div className="border rounded-xl p-4 bg-card">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                                <Brain className="w-5 h-5 text-violet-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-semibold text-sm">Obsidian</h3>
                                    {obsidianConnection ? (
                                        <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-700 dark:text-green-400">
                                            Connected
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-xs">Not configured</Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Bridge memories to your Obsidian vault via the Local REST API plugin.
                                </p>

                                {/* Toggle form */}
                                <button
                                    onClick={() => setObsidianFormOpen(!obsidianFormOpen)}
                                    className="flex items-center gap-1 text-xs text-primary mt-2 hover:underline"
                                >
                                    {obsidianFormOpen ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                    ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    )}
                                    {obsidianConnection ? 'Edit configuration' : 'Configure'}
                                </button>

                                {obsidianFormOpen && (
                                    <div className="mt-3 space-y-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="vault_url" className="text-xs">Vault URL</Label>
                                            <Input
                                                id="vault_url"
                                                placeholder="https://127.0.0.1:27123"
                                                value={obsidianConfig.vault_url}
                                                onChange={(e) =>
                                                    setObsidianConfig((prev) => ({ ...prev, vault_url: e.target.value }))
                                                }
                                                className="text-sm h-8"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="api_key" className="text-xs">API Key</Label>
                                            <Input
                                                id="api_key"
                                                type="password"
                                                placeholder="Your Obsidian REST API key"
                                                value={obsidianConfig.api_key}
                                                onChange={(e) =>
                                                    setObsidianConfig((prev) => ({ ...prev, api_key: e.target.value }))
                                                }
                                                className="text-sm h-8"
                                            />
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                onClick={handleSaveObsidian}
                                                disabled={saving}
                                                className="h-7 text-xs"
                                            >
                                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                                                Save
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={handleHealthCheck}
                                                disabled={healthStatus === 'checking'}
                                                className="h-7 text-xs"
                                            >
                                                {healthStatus === 'checking' ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                                                ) : null}
                                                Health check
                                            </Button>
                                            {healthStatus === 'healthy' && (
                                                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Reachable
                                                </span>
                                            )}
                                            {healthStatus === 'unhealthy' && (
                                                <span className="flex items-center gap-1 text-xs text-destructive">
                                                    <XCircle className="w-3.5 h-3.5" />
                                                    Unreachable
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Setup guide */}
                                <button
                                    onClick={() => setGuideOpen(!guideOpen)}
                                    className="flex items-center gap-1 text-xs text-muted-foreground mt-3 hover:text-foreground"
                                >
                                    {guideOpen ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                    ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    )}
                                    Setup guide
                                </button>

                                {guideOpen && (
                                    <ol className="mt-2 space-y-2 text-xs text-muted-foreground list-none">
                                        {[
                                            { step: 1, text: 'Install Obsidian from obsidian.md' },
                                            { step: 2, text: 'Go to Settings → Community plugins → Enable community plugins' },
                                            {
                                                step: 3,
                                                text: 'Search "Local REST API" in Browse plugins and install it',
                                            },
                                            {
                                                step: 4,
                                                text: 'Open Local REST API settings and copy your API Key',
                                            },
                                            {
                                                step: 5,
                                                text: 'Enter the vault URL (default https://127.0.0.1:27123) and API key above',
                                            },
                                        ].map(({ step, text }) => (
                                            <li key={step} className="flex gap-2">
                                                <span
                                                    className={cn(
                                                        'flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0',
                                                        'bg-violet-500/10 text-violet-600 dark:text-violet-400',
                                                    )}
                                                >
                                                    {step}
                                                </span>
                                                <span className="pt-0.5">{text}</span>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
