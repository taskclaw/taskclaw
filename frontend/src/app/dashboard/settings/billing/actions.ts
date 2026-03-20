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

async function getActiveAccountId(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get('current_account_id')?.value || null
}

/**
 * Create a Stripe Checkout Session to subscribe to a plan.
 * Returns the Stripe Checkout URL to redirect the user to.
 */
export async function createCheckoutSession(planId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/dashboard/settings/billing?checkout=success`
    const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/dashboard/settings/billing?checkout=canceled`

    try {
        const res = await fetch(`${API_URL}/stripe/checkout`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                planId,
                accountId,
                successUrl,
                cancelUrl,
            }),
        })

        if (!res.ok) {
            const error = await res.json()
            return { error: error.message || 'Failed to create checkout session' }
        }

        const data = await res.json()
        return { url: data.url }
    } catch (error: any) {
        return { error: error.message || 'Failed to create checkout session' }
    }
}

/**
 * Create a Stripe Customer Portal session to manage billing.
 * Returns the Portal URL to redirect the user to.
 */
export async function createPortalSession() {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    const accountId = await getActiveAccountId()
    if (!accountId) return { error: 'No active account' }

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/dashboard/settings/billing`

    try {
        const res = await fetch(`${API_URL}/stripe/portal`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                accountId,
                returnUrl,
            }),
        })

        if (!res.ok) {
            const error = await res.json()
            return { error: error.message || 'Failed to create portal session' }
        }

        const data = await res.json()
        return { url: data.url }
    } catch (error: any) {
        return { error: error.message || 'Failed to create portal session' }
    }
}
