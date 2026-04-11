'use client'

import { useState, useEffect } from 'react'
import { Check, Circle, X, Rocket } from 'lucide-react'
import Link from 'next/link'
import { useSidebar } from '@/components/ui/sidebar'

interface OnboardingProgress {
    source_connected: boolean
    categories_defined: boolean
    openclaw_configured: boolean
}

const STORAGE_KEY = 'onboarding_progress'
const DISMISSED_KEY = 'onboarding_checklist_dismissed'

export function OnboardingChecklist() {
    const [progress, setProgress] = useState<OnboardingProgress | null>(null)
    const [dismissed, setDismissed] = useState(true) // default hidden until we check
    const { state: sidebarState } = useSidebar()
    const isCollapsed = sidebarState === 'collapsed'

    useEffect(() => {
        const isDismissed = localStorage.getItem(DISMISSED_KEY) === 'true'
        setDismissed(isDismissed)

        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
            try {
                setProgress(JSON.parse(stored))
            } catch {
                setProgress({ source_connected: false, categories_defined: false, openclaw_configured: false })
            }
        } else {
            setProgress({ source_connected: false, categories_defined: false, openclaw_configured: false })
        }
    }, [])

    if (dismissed || !progress) return null

    const items = [
        { label: 'Connect Source', done: progress.source_connected, href: '/onboarding' },
        { label: 'Define Categories', done: progress.categories_defined, href: '/dashboard/settings/categories' },
        { label: 'Setup OpenClaw', done: progress.openclaw_configured, href: '/dashboard/settings/backbones' },
    ]

    const completedCount = items.filter(i => i.done).length
    const allDone = completedCount === items.length
    const progressPercent = Math.round((completedCount / items.length) * 100)

    const handleDismiss = () => {
        localStorage.setItem(DISMISSED_KEY, 'true')
        setDismissed(true)
    }

    // Collapsed sidebar: show a small rocket icon
    if (isCollapsed) {
        return (
            <Link
                href="/onboarding"
                className="flex items-center justify-center p-2 mx-auto rounded-lg hover:bg-sidebar-accent transition-colors"
                title="Setup Guide"
            >
                <Rocket className="w-4 h-4 text-[#FF4500]" />
            </Link>
        )
    }

    return (
        <div className="mx-2 mb-2 rounded-lg border border-[#334155] bg-[#1E293B]/80 p-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                    <Rocket className="w-3.5 h-3.5 text-[#FF4500]" />
                    <span className="text-xs font-semibold text-slate-300">Setup Guide</span>
                </div>
                <button
                    onClick={handleDismiss}
                    className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                    title="Dismiss"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Progress bar */}
            <div className="h-1 rounded-full bg-slate-700 mb-3">
                <div
                    className="h-full rounded-full bg-[#FF4500] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>

            {/* Checklist items */}
            <div className="space-y-1.5">
                {items.map((item) => (
                    <Link
                        key={item.label}
                        href={item.href}
                        className="flex items-center gap-2 group"
                    >
                        {item.done ? (
                            <div className="w-4 h-4 rounded-full bg-[#00FF94]/10 flex items-center justify-center shrink-0">
                                <Check className="w-2.5 h-2.5 text-[#00FF94]" />
                            </div>
                        ) : (
                            <Circle className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                        <span
                            className={`text-xs transition-colors ${
                                item.done
                                    ? 'text-slate-500 line-through'
                                    : 'text-slate-400 group-hover:text-slate-200'
                            }`}
                        >
                            {item.label}
                        </span>
                    </Link>
                ))}
            </div>

            {/* All done message */}
            {allDone && (
                <p className="text-[10px] text-[#00FF94] mt-2 text-center">
                    All set! You can dismiss this.
                </p>
            )}
        </div>
    )
}
