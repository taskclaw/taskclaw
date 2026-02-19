'use client'

import { useCallback, useEffect, useRef } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PomodoroState {
    isRunning: boolean
    timeLeft: number // seconds
    mode: 'focus' | 'break' | 'longBreak'
    activeTaskId: string | null
    activeTaskTitle: string | null
    focusDuration: number // minutes
    breakDuration: number
    longBreakDuration: number
    sessionsCompleted: number
    setRunning: (running: boolean) => void
    setTimeLeft: (time: number) => void
    setMode: (mode: 'focus' | 'break' | 'longBreak') => void
    setActiveTask: (id: string | null, title: string | null) => void
    reset: () => void
    tick: () => void
}

export const usePomodoroStore = create<PomodoroState>()(
    persist(
        (set, get) => ({
            isRunning: false,
            timeLeft: 25 * 60,
            mode: 'focus',
            activeTaskId: null,
            activeTaskTitle: null,
            focusDuration: 25,
            breakDuration: 5,
            longBreakDuration: 15,
            sessionsCompleted: 0,
            setRunning: (running) => set({ isRunning: running }),
            setTimeLeft: (time) => set({ timeLeft: time }),
            setMode: (mode) => {
                const state = get()
                const duration =
                    mode === 'focus'
                        ? state.focusDuration
                        : mode === 'break'
                            ? state.breakDuration
                            : state.longBreakDuration
                set({ mode, timeLeft: duration * 60, isRunning: false })
            },
            setActiveTask: (id, title) =>
                set({ activeTaskId: id, activeTaskTitle: title }),
            reset: () => {
                const state = get()
                set({ timeLeft: state.focusDuration * 60, isRunning: false, mode: 'focus' })
            },
            tick: () => {
                const state = get()
                if (state.timeLeft > 0) {
                    set({ timeLeft: state.timeLeft - 1 })
                }
            },
        }),
        { name: 'ott-pomodoro' },
    ),
)

function playSound(src: string) {
    try {
        const audio = new Audio(src)
        audio.volume = 0.6
        audio.play().catch(() => {})
    } catch {
        // Audio not available
    }
}

export function usePomodoro() {
    const store = usePomodoroStore()
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const handleComplete = useCallback(async () => {
        const state = usePomodoroStore.getState()
        if (state.mode === 'focus') {
            // Focus session done
            if (typeof window !== 'undefined' && Notification.permission === 'granted') {
                new Notification('Pomodoro Complete!', {
                    body: 'Time for a break.',
                })
            }
            playSound('/sounds/done.wav')

            const sessions = state.sessionsCompleted + 1
            const nextMode = sessions % 4 === 0 ? 'longBreak' : 'break'
            usePomodoroStore.setState({ sessionsCompleted: sessions })
            state.setMode(nextMode)
            // Auto-start break
            setTimeout(() => {
                usePomodoroStore.setState({ isRunning: true })
            }, 50)
        } else {
            // Break done
            if (typeof window !== 'undefined' && Notification.permission === 'granted') {
                new Notification('Break Over!', {
                    body: 'Ready to focus again.',
                })
            }
            playSound('/sounds/done.wav')
            state.setMode('focus')
        }
    }, [])

    useEffect(() => {
        if (store.isRunning) {
            intervalRef.current = setInterval(() => {
                const state = usePomodoroStore.getState()
                if (state.timeLeft <= 1) {
                    clearInterval(intervalRef.current!)
                    usePomodoroStore.setState({ timeLeft: 0, isRunning: false })
                    handleComplete()
                } else {
                    state.tick()
                }
            }, 1000)
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current)
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [store.isRunning, handleComplete])

    const toggleTimer = useCallback(() => {
        const state = usePomodoroStore.getState()
        if (!state.isRunning) {
            // Playing start sound when beginning a session
            playSound('/sounds/start.wav')
        }
        store.setRunning(!store.isRunning)
    }, [store])

    const formatTime = useCallback((seconds: number) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }, [])

    return {
        ...store,
        toggleTimer,
        formattedTime: formatTime(store.timeLeft),
    }
}
