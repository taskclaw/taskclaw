'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    getBackboneConnections,
    getBackboneConnection,
    createBackboneConnection,
    updateBackboneConnection,
    deleteBackboneConnection,
    verifyBackboneConnection,
    setDefaultBackboneConnection,
} from '@/app/dashboard/settings/backbones/actions'
import type {
    CreateBackboneConnectionPayload,
    UpdateBackboneConnectionPayload,
} from '@/types/backbone'

export function useBackboneConnections() {
    return useQuery({
        queryKey: ['backboneConnections'],
        queryFn: () => getBackboneConnections(),
        staleTime: 30000,
        refetchInterval: 60000,
    })
}

export function useBackboneConnection(connectionId: string | null) {
    return useQuery({
        queryKey: ['backboneConnection', connectionId],
        queryFn: () => getBackboneConnection(connectionId!),
        enabled: !!connectionId,
        staleTime: 30000,
    })
}

export function useCreateBackboneConnection() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateBackboneConnectionPayload) =>
            createBackboneConnection(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['backboneConnections'] })
        },
    })
}

export function useUpdateBackboneConnection() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ connectionId, ...data }: { connectionId: string } & UpdateBackboneConnectionPayload) =>
            updateBackboneConnection(connectionId, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['backboneConnections'] })
            qc.invalidateQueries({ queryKey: ['backboneConnection'] })
        },
    })
}

export function useDeleteBackboneConnection() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (connectionId: string) =>
            deleteBackboneConnection(connectionId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['backboneConnections'] })
        },
    })
}

export function useVerifyBackboneConnection() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (connectionId: string) =>
            verifyBackboneConnection(connectionId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['backboneConnections'] })
            qc.invalidateQueries({ queryKey: ['backboneConnection'] })
        },
    })
}

export function useSetDefaultBackboneConnection() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (connectionId: string) =>
            setDefaultBackboneConnection(connectionId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['backboneConnections'] })
        },
    })
}
