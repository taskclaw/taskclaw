'use client'

import { create } from 'zustand'

interface TaskStore {
    selectedTaskId: string | null
    setSelectedTaskId: (id: string | null) => void
}

export const useTaskStore = create<TaskStore>((set) => ({
    selectedTaskId: null,
    setSelectedTaskId: (id) => {
        set({ selectedTaskId: id })
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            if (id) {
                url.searchParams.set('task', id)
            } else {
                url.searchParams.delete('task')
            }
            window.history.replaceState({}, '', url.toString())
        }
    },
}))
