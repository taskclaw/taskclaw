'use client'

import { useQuery } from '@tanstack/react-query'
import { getAgentsDashboard } from '@/app/dashboard/agents/actions'

export function useAgentsDashboard() {
    return useQuery({
        queryKey: ['agentsDashboard'],
        queryFn: () => getAgentsDashboard(),
        staleTime: 30000,
        refetchInterval: 60000,
    })
}
