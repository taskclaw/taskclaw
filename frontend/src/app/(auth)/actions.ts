'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { login as authLogin, signup as authSignup, logout as authLogout, forgotPassword as authForgotPassword, updatePassword as authUpdatePassword, setAuthToken, getAuthToken } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'

export async function login(prevState: { error: string } | null, formData: FormData) {
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    try {
        const session = await authLogin({ email, password })
        await setAuthToken(session.access_token)
        
        // Set default account cookie after login
        const token = await getAuthToken()
        if (token) {
            const res = await fetch(`${API_URL}/accounts`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            })
            
            if (res.ok) {
                const accounts = await res.json()
                if (accounts && accounts.length > 0) {
                    const cookieStore = await cookies()
                    cookieStore.set('current_account_id', accounts[0].id, {
                        path: '/',
                        maxAge: 60 * 60 * 24 * 7, // 1 week
                    })
                    // Track onboarding status for middleware redirect
                    const onboardingCompleted = accounts[0].onboarding_completed ?? true
                    cookieStore.set('onboarding_completed', String(onboardingCompleted), {
                        path: '/',
                        maxAge: 60 * 60 * 24 * 7,
                    })
                    console.log('[login] Set current_account_id cookie:', accounts[0].id)
                }
            }
        }
    } catch (error: any) {
        return { error: error.message }
    }

    revalidatePath('/', 'layout')
    redirect('/dashboard')
}

export async function signup(prevState: { error: string, success?: boolean } | null, formData: FormData) {
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const name = formData.get('name') as string

    try {
        await authSignup({ email, password, name })
        // Do not log in immediately. Wait for admin approval.
        return { error: '', success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function logout() {
    await authLogout()
    revalidatePath('/', 'layout')
    redirect('/login')
}

export async function forgotPassword(prevState: { error: string, success?: boolean } | null, formData: FormData) {
    const email = formData.get('email') as string

    try {
        await authForgotPassword(email)
        return { error: '', success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updatePassword(prevState: { error: string, success?: boolean } | null, formData: FormData) {
    const password = formData.get('password') as string

    try {
        await authUpdatePassword(password)
    } catch (error: any) {
        return { error: error.message }
    }

    redirect('/dashboard')
}
