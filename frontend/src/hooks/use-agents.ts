'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    getAgentsDashboard,
    getAgents,
    getAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    pauseAgent,
    resumeAgent,
    cloneAgent,
    getAgentActivity,
    getAgentSkills,
    addSkillToAgent,
    removeSkillFromAgent,
    getAgentKnowledge,
} from '@/app/dashboard/agents/actions'
import type { CreateAgentInput, UpdateAgentInput } from '@/types/agent'

// Legacy dashboard hook (categories-based sync status)
export function useAgentsDashboard() {
    return useQuery({
        queryKey: ['agentsDashboard'],
        queryFn: () => getAgentsDashboard(),
        staleTime: 30000,
        refetchInterval: 60000,
    })
}

// New hooks for agents table (F01+)

export function useAgents(filters?: { status?: string; agent_type?: string }) {
    return useQuery({
        queryKey: ['agents', filters],
        queryFn: () => getAgents(filters),
        staleTime: 30000,
        refetchInterval: 30000,
    })
}

export function useAgent(agentId: string) {
    return useQuery({
        queryKey: ['agent', agentId],
        queryFn: () => getAgent(agentId),
        staleTime: 30000,
        enabled: !!agentId,
    })
}

export function useAgentActivity(agentId: string, page = 1, limit = 20) {
    return useQuery({
        queryKey: ['agentActivity', agentId, page, limit],
        queryFn: () => getAgentActivity(agentId, page, limit),
        staleTime: 15000,
        enabled: !!agentId,
    })
}

export function useCreateAgent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: CreateAgentInput) => createAgent(input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['agents'] })
            qc.invalidateQueries({ queryKey: ['agentsDashboard'] })
        },
    })
}

export function useUpdateAgent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ agentId, input }: { agentId: string; input: UpdateAgentInput }) =>
            updateAgent(agentId, input),
        onSuccess: (_, { agentId }) => {
            qc.invalidateQueries({ queryKey: ['agents'] })
            qc.invalidateQueries({ queryKey: ['agent', agentId] })
        },
    })
}

export function useDeleteAgent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (agentId: string) => deleteAgent(agentId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['agents'] })
        },
    })
}

export function usePauseAgent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (agentId: string) => pauseAgent(agentId),
        onSuccess: (_, agentId) => {
            qc.invalidateQueries({ queryKey: ['agents'] })
            qc.invalidateQueries({ queryKey: ['agent', agentId] })
        },
    })
}

export function useResumeAgent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (agentId: string) => resumeAgent(agentId),
        onSuccess: (_, agentId) => {
            qc.invalidateQueries({ queryKey: ['agents'] })
            qc.invalidateQueries({ queryKey: ['agent', agentId] })
        },
    })
}

export function useCloneAgent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ agentId, name }: { agentId: string; name?: string }) =>
            cloneAgent(agentId, name),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['agents'] })
        },
    })
}

export function useAgentSkills(agentId: string) {
    return useQuery({
        queryKey: ['agentSkills', agentId],
        queryFn: () => getAgentSkills(agentId),
        staleTime: 30000,
        enabled: !!agentId,
    })
}

export function useAddSkillToAgent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ agentId, skillId }: { agentId: string; skillId: string }) =>
            addSkillToAgent(agentId, skillId),
        onSuccess: (_, { agentId }) => {
            qc.invalidateQueries({ queryKey: ['agentSkills', agentId] })
        },
    })
}

export function useRemoveSkillFromAgent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ agentId, skillId }: { agentId: string; skillId: string }) =>
            removeSkillFromAgent(agentId, skillId),
        onSuccess: (_, { agentId }) => {
            qc.invalidateQueries({ queryKey: ['agentSkills', agentId] })
        },
    })
}

export function useAgentKnowledge(agentId: string) {
    return useQuery({
        queryKey: ['agentKnowledge', agentId],
        queryFn: () => getAgentKnowledge(agentId),
        staleTime: 30000,
        enabled: !!agentId,
    })
}
