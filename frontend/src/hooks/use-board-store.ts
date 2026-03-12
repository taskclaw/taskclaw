'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BoardStore {
    activeBoardId: string | null
    setActiveBoardId: (id: string | null) => void
}

export const useBoardStore = create<BoardStore>()(
    persist(
        (set) => ({
            activeBoardId: null,
            setActiveBoardId: (id) => set({ activeBoardId: id }),
        }),
        {
            name: 'board-store',
        },
    ),
)
