'use client'

import { Pause, Play, RotateCcw } from 'lucide-react'
import { usePomodoro } from '@/hooks/use-pomodoro'

export function PomodoroTimer() {
    const { formattedTime, isRunning, mode, activeTaskTitle, toggleTimer, reset } =
        usePomodoro()

    const isBreak = mode === 'break' || mode === 'longBreak'

    return (
        <div
            className={`flex items-center gap-3 bg-accent/50 px-4 py-2 rounded-xl border ${
                isBreak ? 'border-emerald-500/20' : 'border-orange-500/20'
            }`}
        >
            <div className="text-right">
                <div
                    className={`text-lg font-bold tabular-nums font-mono leading-none ${
                        isBreak ? 'text-emerald-400' : 'text-orange-400'
                    }`}
                >
                    {formattedTime}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {mode === 'focus' ? 'Pomodoro Focus' : mode === 'break' ? 'Short Break' : 'Long Break'}
                </div>
                {activeTaskTitle && (
                    <div
                        className={`text-[8px] truncate max-w-[120px] ${
                            isBreak ? 'text-emerald-400/60' : 'text-orange-400/60'
                        }`}
                    >
                        {activeTaskTitle}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1">
                <button
                    onClick={toggleTimer}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        isBreak
                            ? 'bg-emerald-400/20 text-emerald-400 hover:bg-emerald-400/30'
                            : 'bg-orange-400/20 text-orange-400 hover:bg-orange-400/30'
                    }`}
                >
                    {isRunning ? (
                        <Pause className="w-4 h-4" />
                    ) : (
                        <Play className="w-4 h-4" />
                    )}
                </button>
                <button
                    onClick={reset}
                    className="w-6 h-6 rounded-md text-muted-foreground flex items-center justify-center hover:text-foreground transition-colors"
                >
                    <RotateCcw className="w-3 h-3" />
                </button>
            </div>
        </div>
    )
}
