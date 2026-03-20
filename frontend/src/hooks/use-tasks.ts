'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTasks, getTask, getTaskContent, getTaskComments, createTask, updateTask, deleteTask } from '@/app/dashboard/tasks/actions'
import { getTaskUsage } from '@/app/dashboard/settings/usage/actions'
import { getAiProviderConfig } from '@/app/dashboard/settings/ai-provider/actions'
import type { Task } from '@/types/task'

export function useTasks() {
    return useQuery({
        queryKey: ['tasks'],
        queryFn: () => getTasks({ completed: 'false' }),
        refetchInterval: 60000,
        staleTime: 30000,
        retry: 2,
        retryDelay: 3000,
    })
}

export function useTaskDetail(id: string | null) {
    return useQuery({
        queryKey: ['task', id],
        queryFn: () => getTask(id!),
        enabled: !!id,
    })
}

export function useTaskContent(id: string | null) {
    return useQuery({
        queryKey: ['taskContent', id],
        queryFn: () => getTaskContent(id!),
        enabled: !!id,
    })
}

export function useTaskComments(id: string | null) {
    return useQuery({
        queryKey: ['taskComments', id],
        queryFn: () => getTaskComments(id!),
        enabled: !!id,
        refetchInterval: 30000, // Refresh comments every 30s
    })
}

export function useCreateTask() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createTask,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    })
}

export function useUpdateTask() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...updates }: { id: string } & Parameters<typeof updateTask>[1]) =>
            updateTask(id, updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['tasks'] })
            qc.invalidateQueries({ queryKey: ['boardTasks'] })
        },
    })
}

export function useMoveTask() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) =>
            updateTask(id, { status }),
        onMutate: async ({ id, status }) => {
            await qc.cancelQueries({ queryKey: ['tasks'] })
            const prev = qc.getQueryData<Task[]>(['tasks'])
            if (prev) {
                qc.setQueryData<Task[]>(
                    ['tasks'],
                    prev.map((t) =>
                        t.id === id
                            ? { ...t, status, completed: status === 'Done' }
                            : t,
                    ),
                )
            }
            return { prev }
        },
        onError: (_err, _vars, context) => {
            if (context?.prev) qc.setQueryData(['tasks'], context.prev)
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: ['tasks'] })
            qc.invalidateQueries({ queryKey: ['boardTasks'] })
        },
    })
}

export function useCompleteTask() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => updateTask(id, { completed: true, status: 'Done' }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['tasks'] })
            qc.invalidateQueries({ queryKey: ['boardTasks'] })
        },
    })
}

export function useTaskUsage(id: string | null) {
    return useQuery({
        queryKey: ['taskUsage', id],
        queryFn: () => getTaskUsage(id!),
        enabled: !!id,
        staleTime: 60000, // Cache for 1 minute
    })
}

export function useDeleteTask() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deleteTask,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['tasks'] })
            qc.invalidateQueries({ queryKey: ['boardTasks'] })
        },
    })
}

export function useAiProviderConfig() {
    return useQuery({
        queryKey: ['aiProviderConfig'],
        queryFn: () => getAiProviderConfig(),
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: false,
    })
}
