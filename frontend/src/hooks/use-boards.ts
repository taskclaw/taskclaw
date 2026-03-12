'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    getBoards,
    getBoard,
    getBoardTasks,
    createBoard,
    updateBoard,
    deleteBoard,
    duplicateBoard,
    getTemplates,
    installTemplate,
} from '@/app/dashboard/boards/actions'
import { updateTask } from '@/app/dashboard/tasks/actions'
import type { Board } from '@/types/board'
import type { Task } from '@/types/task'

export function useBoards(filters?: { archived?: string; favorite?: string }) {
    return useQuery({
        queryKey: ['boards', filters],
        queryFn: () => getBoards(filters),
        staleTime: 30000,
        refetchInterval: 60000,
    })
}

export function useBoard(id: string | null) {
    return useQuery({
        queryKey: ['board', id],
        queryFn: () => getBoard(id!),
        enabled: !!id,
        staleTime: 30000,
    })
}

export function useBoardTasks(boardId: string | null) {
    return useQuery({
        queryKey: ['boardTasks', boardId],
        queryFn: () => getBoardTasks(boardId!),
        enabled: !!boardId,
        staleTime: 30000,
        refetchInterval: 60000,
    })
}

export function useCreateBoard() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createBoard,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['boards'] })
        },
    })
}

export function useUpdateBoard() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...updates }: { id: string } & Parameters<typeof updateBoard>[1]) =>
            updateBoard(id, updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['boards'] })
        },
    })
}

export function useDeleteBoard() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deleteBoard,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['boards'] })
        },
    })
}

export function useDuplicateBoard() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: duplicateBoard,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['boards'] })
        },
    })
}

export function useTemplates() {
    return useQuery({
        queryKey: ['boardTemplates'],
        queryFn: () => getTemplates(),
        staleTime: 300000, // 5 min
    })
}

export function useInstallTemplate() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: installTemplate,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['boards'] })
        },
    })
}

export function useMoveTaskToStep() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ taskId, stepId, stepName }: { taskId: string; stepId: string; stepName: string }) =>
            updateTask(taskId, { current_step_id: stepId, status: stepName } as any),
        onMutate: async ({ taskId, stepId, stepName }) => {
            // Optimistic update for all board task queries
            const queries = qc.getQueriesData<Task[]>({ queryKey: ['boardTasks'] })
            const previousData: [readonly unknown[], Task[] | undefined][] = []

            queries.forEach(([queryKey, data]) => {
                if (data) {
                    previousData.push([queryKey, data])
                    qc.setQueryData<Task[]>(
                        queryKey,
                        data.map((t) =>
                            t.id === taskId
                                ? { ...t, current_step_id: stepId, status: stepName }
                                : t,
                        ),
                    )
                }
            })

            return { previousData }
        },
        onError: (_err, _vars, context) => {
            // Rollback
            context?.previousData?.forEach(([queryKey, data]) => {
                qc.setQueryData(queryKey, data)
            })
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: ['boardTasks'] })
        },
    })
}
