'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, LayoutGrid } from 'lucide-react'

const BOARD_PREVIEWS = [
    {
        name: 'Personal',
        color: '#EC4899',
        icon: '🏠',
        tasks: [
            { title: 'Plan weekend activities', tag: 'Life' },
            { title: 'Call dentist for appointment', tag: 'Health' },
            { title: 'Read 20 pages of book', tag: 'Learning' },
            { title: 'Grocery shopping list', tag: 'Errands' },
            { title: 'Workout session at gym', tag: 'Fitness' },
        ],
    },
    {
        name: 'Professional',
        color: '#3B82F6',
        icon: '💼',
        tasks: [
            { title: 'Prepare Q2 status report', tag: 'Reports' },
            { title: 'Review pull requests from team', tag: 'Dev' },
            { title: 'Schedule 1-on-1 with manager', tag: 'Meetings' },
            { title: 'Update project documentation', tag: 'Docs' },
            { title: 'Research competitor features', tag: 'Strategy' },
        ],
    },
]

interface StepBoardsProps {
    onContinue: () => void
}

export function StepBoards({ onContinue }: StepBoardsProps) {
    const [phase, setPhase] = useState<'preview' | 'done'>('preview')

    // Auto-advance after 1.5s to give the feeling boards are being created
    useEffect(() => {
        const t = setTimeout(() => setPhase('done'), 1500)
        return () => clearTimeout(t)
    }, [])

    return (
        <div className="w-full max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
                <div
                    className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
                    style={{
                        background: 'radial-gradient(circle, rgba(255,69,0,0.2) 0%, rgba(255,69,0,0.05) 100%)',
                        boxShadow: '0 0 40px rgba(255, 69, 0, 0.15)',
                    }}
                >
                    <LayoutGrid className="w-8 h-8 text-[#FF4500]" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-50">
                    Your boards are ready
                </h1>
                <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                    We created two boards to get you started. Customize them or create new ones anytime.
                </p>
            </div>

            {/* Board previews */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {BOARD_PREVIEWS.map((board) => (
                    <div key={board.name}
                        className="bg-[#1E293B] border border-[#334155] rounded-xl p-4 overflow-hidden">
                        {/* Board header */}
                        <div className="flex items-center gap-2.5 mb-4">
                            <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                                style={{ backgroundColor: `${board.color}20`, border: `1px solid ${board.color}40` }}
                            >
                                {board.icon}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-50">{board.name}</p>
                                <p className="text-xs text-slate-500">{board.tasks.length} starter tasks</p>
                            </div>
                            <div className="ml-auto">
                                {phase === 'preview' ? (
                                    <Loader2 className="w-4 h-4 text-slate-600 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4 text-[#00FF94]" />
                                )}
                            </div>
                        </div>

                        {/* Task list */}
                        <div className="space-y-1.5">
                            {board.tasks.map((task, i) => (
                                <div key={i}
                                    className="flex items-center gap-2 px-3 py-2 bg-[#0F172A] rounded-lg">
                                    <div className="w-4 h-4 rounded border border-[#334155] shrink-0 flex items-center justify-center">
                                        <div
                                            className="w-2 h-2 rounded-sm opacity-40"
                                            style={{ backgroundColor: board.color }}
                                        />
                                    </div>
                                    <span className="text-xs text-slate-300 flex-1 min-w-0 truncate">{task.title}</span>
                                    <span
                                        className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                                        style={{ backgroundColor: `${board.color}20`, color: board.color }}
                                    >
                                        {task.tag}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* CTA */}
            <button
                onClick={onContinue}
                disabled={phase === 'preview'}
                className="w-full h-12 rounded-lg bg-[#FF4500] text-black font-bold hover:bg-[#E63E00] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ boxShadow: '0 0 20px rgba(255, 69, 0, 0.2)' }}
            >
                {phase === 'preview' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Creating boards…</>
                ) : (
                    <>Continue</>
                )}
            </button>
        </div>
    )
}
