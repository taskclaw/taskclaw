'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

const MESSAGES = [
    'Claw is grabbing your tasks…',
    'Sorting cards by vibe…',
    'Sharpening the claw…',
    'Reticulating task pipelines…',
    'Moving stuff around…',
    'Convincing tasks to cooperate…',
    'Untangling the backlog…',
    'Pinching deadlines into shape…',
    'Herding task cards…',
    'Deploying the claw…',
]

function randomMessage() {
    return MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
}

const CARD_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ec4899']
const CARD_LABELS = ['In Progress', 'Review', 'Done', 'Blocked', 'Todo']

// A single floating task card with a colored status dot
function TaskCard({ style, index }: { style: React.CSSProperties; index: number }) {
    const color = CARD_COLORS[index % CARD_COLORS.length]
    const label = CARD_LABELS[index % CARD_LABELS.length]
    return (
        <div
            className="absolute rounded-xl border bg-white dark:bg-zinc-900 shadow-lg px-3 py-2.5 text-xs w-32 select-none pointer-events-none"
            style={style}
        >
            {/* Title bar */}
            <div className="h-2 w-20 rounded-full bg-zinc-200 dark:bg-zinc-700 mb-2" />
            {/* Sub-line */}
            <div className="h-1.5 w-12 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-2.5" />
            {/* Status pill */}
            <div
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
                style={{ backgroundColor: `${color}22` }}
            >
                <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                />
                <span className="text-[9px] font-medium" style={{ color }}>
                    {label}
                </span>
            </div>
        </div>
    )
}

// SVG claw — pincer shape made of two arcs
function Claw({ grabbing }: { grabbing: boolean }) {
    return (
        <svg
            width="80"
            height="96"
            viewBox="0 0 80 96"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-lg"
            style={{
                transform: grabbing ? 'rotate(-8deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease-in-out',
            }}
        >
            {/* Arm */}
            <rect x="32" y="0" width="16" height="48" rx="8" fill="#e11d48" />
            {/* Left pincer */}
            <path
                d="M40 48 Q18 60 14 80 Q12 90 22 90 Q32 90 36 72 L40 56 Z"
                fill="#e11d48"
                style={{
                    transformOrigin: '40px 48px',
                    transform: grabbing ? 'rotate(12deg)' : 'rotate(0deg)',
                    transition: 'transform 0.25s ease-in-out',
                }}
            />
            {/* Right pincer */}
            <path
                d="M40 48 Q62 60 66 80 Q68 90 58 90 Q48 90 44 72 L40 56 Z"
                fill="#be123c"
                style={{
                    transformOrigin: '40px 48px',
                    transform: grabbing ? 'rotate(-12deg)' : 'rotate(0deg)',
                    transition: 'transform 0.25s ease-in-out',
                }}
            />
            {/* Left claw tip */}
            <ellipse
                cx={grabbing ? 20 : 16}
                cy={grabbing ? 86 : 90}
                rx="5"
                ry="3"
                fill="#9f1239"
                style={{ transition: 'all 0.25s ease-in-out' }}
            />
            {/* Right claw tip */}
            <ellipse
                cx={grabbing ? 60 : 64}
                cy={grabbing ? 86 : 90}
                rx="5"
                ry="3"
                fill="#9f1239"
                style={{ transition: 'all 0.25s ease-in-out' }}
            />
        </svg>
    )
}

export function NavigationLoader() {
    const pathname = usePathname()
    const [visible, setVisible] = useState(false)
    const [grabbing, setGrabbing] = useState(false)
    const [message, setMessage] = useState(randomMessage())
    const prevPathname = useRef(pathname)
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (pathname !== prevPathname.current) {
            prevPathname.current = pathname

            // Page changed — hide the overlay
            if (hideTimer.current) clearTimeout(hideTimer.current)
            setGrabbing(true)
            hideTimer.current = setTimeout(() => {
                setVisible(false)
                setGrabbing(false)
            }, 350)
        }
    }, [pathname])

    // Expose a global trigger so Link clicks can show the loader immediately
    useEffect(() => {
        const handleNavigationStart = () => {
            if (hideTimer.current) clearTimeout(hideTimer.current)
            setMessage(randomMessage())
            setGrabbing(false)
            setVisible(true)
            // Start grab animation after a brief moment
            setTimeout(() => setGrabbing(true), 300)
        }

        window.addEventListener('navigation-loader:start', handleNavigationStart)
        return () => window.removeEventListener('navigation-loader:start', handleNavigationStart)
    }, [])

    if (!visible) return null

    return (
        <div
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
        >
            {/* Floating task cards behind the claw */}
            <div className="relative w-64 h-64 flex items-center justify-center">
                <TaskCard index={0} style={{ top: '10%', left: '2%', transform: 'rotate(-8deg)', opacity: 0.9 }} />
                <TaskCard index={1} style={{ top: '5%', right: '0%', transform: 'rotate(6deg)', opacity: 0.8 }} />
                <TaskCard index={2} style={{ bottom: '10%', left: '0%', transform: 'rotate(5deg)', opacity: 0.85 }} />
                <TaskCard index={3} style={{ bottom: '8%', right: '2%', transform: 'rotate(-10deg)', opacity: 0.9 }} />

                {/* Bouncing claw */}
                <div
                    style={{
                        animation: 'claw-bounce 1.1s ease-in-out infinite',
                        zIndex: 10,
                    }}
                >
                    <Claw grabbing={grabbing} />
                </div>
            </div>

            <p className="mt-4 text-sm font-medium text-white/90 tracking-wide animate-pulse">
                {message}
            </p>

            <style>{`
                @keyframes claw-bounce {
                    0%, 100% { transform: translateY(0px); }
                    50%       { transform: translateY(-14px); }
                }
            `}</style>
        </div>
    )
}
