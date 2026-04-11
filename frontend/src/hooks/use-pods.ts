'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    getPods,
    getPodBySlug,
    createPod,
    updatePod,
    deletePod,
    getPodBoards,
    assignBoardToPod,
    removeFromPod,
    getAllBoards,
} from '@/app/dashboard/pods/actions'
import type { CreatePodPayload, UpdatePodPayload } from '@/types/pod'

export function usePods() {
    return useQuery({
        queryKey: ['pods'],
        queryFn: getPods,
        staleTime: 30000,
        refetchInterval: 60000,
    })
}

export function usePod(slug: string) {
    return useQuery({
        queryKey: ['pods', slug],
        queryFn: () => getPodBySlug(slug),
        enabled: !!slug,
        staleTime: 30000,
    })
}

export function usePodBoards(podId: string | null) {
    return useQuery({
        queryKey: ['podBoards', podId],
        queryFn: () => getPodBoards(podId!),
        enabled: !!podId,
        staleTime: 30000,
    })
}

export function useCreatePod() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (payload: CreatePodPayload) => createPod(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['pods'] })
        },
    })
}

export function useUpdatePod() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ podId, payload }: { podId: string; payload: UpdatePodPayload }) =>
            updatePod(podId, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['pods'] })
        },
    })
}

export function useDeletePod() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deletePod,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['pods'] })
        },
    })
}

export function useAssignBoardToPod() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ boardId, podId }: { boardId: string; podId: string }) =>
            assignBoardToPod(boardId, podId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['podBoards'] })
            qc.invalidateQueries({ queryKey: ['boards'] })
        },
    })
}

export function useRemoveFromPod() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (boardId: string) => removeFromPod(boardId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['podBoards'] })
            qc.invalidateQueries({ queryKey: ['boards'] })
        },
    })
}

export function useAllBoards() {
    return useQuery({
        queryKey: ['boards', 'all'],
        queryFn: getAllBoards,
        staleTime: 30000,
    })
}
