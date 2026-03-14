'use client'

import { Grid3X3, Calendar, CheckSquare, BarChart3, Play } from 'lucide-react'

interface LivePreviewProps {
    notionConnected: boolean
    categoriesSelected: string[]
}

export function LivePreview({ notionConnected, categoriesSelected }: LivePreviewProps) {
    return (
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5 w-full max-w-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                Live Preview
            </h3>

            {/* Mini workspace */}
            <div className="bg-[#0F172A] rounded-xl border border-[#334155] overflow-hidden">
                {/* Mini nav */}
                <div className="flex items-center gap-3 px-3 py-2 border-b border-[#334155]">
                    <div className="w-5 h-5 rounded bg-[#FF4500] flex items-center justify-center">
                        <span className="text-[8px] font-bold text-black">TC</span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-300">Workspace Preview</span>
                </div>

                {/* Mini sidebar + content */}
                <div className="flex">
                    {/* Mini sidebar */}
                    <div className="w-10 border-r border-[#334155] py-2 flex flex-col items-center gap-2">
                        <Grid3X3 className="w-3.5 h-3.5 text-slate-500" />
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <CheckSquare className="w-3.5 h-3.5 text-[#FF4500]" />
                        <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
                    </div>

                    {/* Content area */}
                    <div className="flex-1 p-3 space-y-2">
                        {/* Categories / Folders */}
                        {categoriesSelected.length > 0 ? (
                            <>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                    Agents
                                </p>
                                {categoriesSelected.slice(0, 3).map((cat, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#FF4500]" />
                                        <span className="text-[9px] text-slate-400 truncate">{cat}</span>
                                    </div>
                                ))}
                                {categoriesSelected.length > 3 && (
                                    <span className="text-[9px] text-slate-600 pl-2">
                                        +{categoriesSelected.length - 3} more
                                    </span>
                                )}
                            </>
                        ) : (
                            <>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                    Folders
                                </p>
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                    <span className="text-[9px] text-slate-500">Marketing</span>
                                </div>
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                    <span className="text-[9px] text-slate-500">Product Dev</span>
                                </div>
                            </>
                        )}

                        {/* Sources */}
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-2 mb-1">
                            Sources
                        </p>
                        <div
                            className={`flex items-center gap-1.5 px-2 py-1 rounded ${
                                notionConnected ? 'bg-[#FF4500]/10 border border-[#FF4500]/20' : 'bg-slate-800'
                            }`}
                        >
                            <div
                                className={`w-1.5 h-1.5 rounded-full ${
                                    notionConnected ? 'bg-[#00FF94]' : 'bg-slate-600'
                                }`}
                            />
                            <span
                                className={`text-[9px] ${
                                    notionConnected ? 'text-[#FF4500]' : 'text-slate-500'
                                }`}
                            >
                                {notionConnected ? 'Notion (Synced)' : 'No sources yet'}
                            </span>
                        </div>

                        {/* Task placeholders */}
                        <div className="mt-2 space-y-1">
                            <div className="h-5 bg-slate-800 rounded w-full" />
                            <div className="h-5 bg-slate-800 rounded w-4/5" />
                            <div className="h-5 bg-slate-800 rounded w-3/5" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Pomodoro widget */}
            <div className="mt-3 bg-[#FF4500]/10 border border-[#FF4500]/20 rounded-xl p-3 flex items-center justify-between">
                <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[#FF4500]">
                        Focus Timer
                    </p>
                    <p className="text-xl font-bold text-slate-50 font-mono">25:00</p>
                </div>
                <button className="w-8 h-8 rounded-full bg-[#FF4500] flex items-center justify-center">
                    <Play className="w-3.5 h-3.5 text-black ml-0.5" />
                </button>
            </div>

            {/* Dynamic preview note */}
            <div className="mt-3 flex items-start gap-2 px-1">
                <div className="w-4 h-4 shrink-0 mt-0.5 text-[#FF4500]">
                    <Rocket className="w-4 h-4" />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                    <span className="font-semibold text-slate-400">Dynamic Preview</span>
                    <br />
                    As you complete the checklist, your workspace on the left will populate with
                    your real-time configurations.
                </p>
            </div>
        </div>
    )
}

function Rocket(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
    )
}
