'use client'

import { useQuery } from '@tanstack/react-query'
import { getBackboneDefinitions } from '@/app/dashboard/settings/backbones/actions'

export function useBackboneDefinitions() {
    return useQuery({
        queryKey: ['backboneDefinitions'],
        queryFn: () => getBackboneDefinitions(),
        staleTime: 300000, // 5 min — definitions rarely change
    })
}
