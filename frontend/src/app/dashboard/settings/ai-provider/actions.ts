'use server'

import { getAuthToken, isTokenExpired } from '@/lib/auth'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'

async function getAuthHeaders() {
    const token = await getAuthToken()
    if (!token || isTokenExpired(token)) return null
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    }
}

async function getCurrentAccountId() {
    const cookieStore = await cookies()
    return cookieStore.get('current_account_id')?.value
}

export async function getAiProviderConfig() {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    
    if (!headers || !accountId) return null

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/ai-provider`, {
            headers,
            cache: 'no-store',
        })
        
        if (!res.ok) return null
        const text = await res.text()
        if (!text) return null
        return JSON.parse(text)
    } catch (error) {
        console.error('Failed to load AI provider config:', error)
        return null
    }
}

export async function saveAiProviderConfig(data: {
    api_url: string
    api_key?: string
    agent_id?: string
    openrouter_api_key?: string
    telegram_bot_token?: string
    brave_search_api_key?: string
}) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    
    if (!headers || !accountId) {
        return { error: 'Not authenticated' }
    }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/ai-provider`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })
        
        if (!res.ok) {
            const error = await res.json()
            return { error: error.message || 'Failed to save configuration' }
        }
        
        return await res.json()
    } catch (error: any) {
        return { error: error.message || 'Network error' }
    }
}

export async function verifyAiProviderConnection(data: {
    api_url: string
    api_key?: string
    agent_id?: string
}) {
    const headers = await getAuthHeaders()
    const accountId = await getCurrentAccountId()
    
    if (!headers || !accountId) {
        return { success: false, message: 'Not authenticated' }
    }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/ai-provider/verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        })
        
        return await res.json()
    } catch (error: any) {
        return { success: false, message: error.message || 'Network error' }
    }
}
