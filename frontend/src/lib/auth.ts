import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'

export async function getAuthToken() {
    const cookieStore = await cookies()
    return cookieStore.get('auth_token')?.value
}

export function isTokenExpired(token: string): boolean {
    try {
        const payloadBase64 = token.split('.')[1];
        if (!payloadBase64) return true;

        const decodedJson = JSON.parse(atob(payloadBase64));
        const exp = decodedJson.exp;

        if (!exp) return true;

        // Check if expired (exp is in seconds, Date.now() is in ms)
        return (Date.now() >= exp * 1000);
    } catch (e) {
        return true;
    }
}

export async function setAuthToken(token: string) {
    const cookieStore = await cookies()
    // Set cookie with appropriate options (httpOnly, secure, etc.)
    // Note: In a real app, you might want strict secure flags.
    // For now, we set it to be accessible.
    cookieStore.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 1 week
    })
}

export async function clearAuthToken() {
    const cookieStore = await cookies()
    cookieStore.delete('auth_token')
}

export async function login(data: any) {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })

    if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Login failed')
    }

    return res.json()
}

export async function signup(data: any) {
    const res = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })

    if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Signup failed')
    }

    return res.json()
}

export async function logout() {
    const token = await getAuthToken()
    if (!token) return

    await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })

    await clearAuthToken()
}

export async function updatePassword(password: string) {
    const token = await getAuthToken()
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`${API_URL}/auth/update-password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password }),
    })

    if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Failed to update password')
    }

    return res.json()
}

export async function forgotPassword(email: string) {
    const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/update-password` }),
    })

    if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Failed to send reset email')
    }

    return res.json()
}
