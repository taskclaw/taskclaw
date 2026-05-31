import { serverApiBase } from '@/lib/api-base'
import { cookies } from 'next/headers'

const API_URL = serverApiBase()

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
    // Set cookie with appropriate options (httpOnly, secure, etc.).
    // `secure` defaults to on in production (HTTPS), but a Secure cookie is
    // silently dropped by browsers over plain HTTP — which breaks login for
    // self-hosters serving over http://<ip>. COOKIE_SECURE overrides the
    // default: set COOKIE_SECURE=false to self-host over HTTP, or =true to
    // force Secure behind a TLS-terminating proxy.
    const cookieSecure =
        process.env.COOKIE_SECURE !== undefined
            ? process.env.COOKIE_SECURE === 'true'
            : process.env.NODE_ENV === 'production'
    cookieStore.set('auth_token', token, {
        httpOnly: true,
        secure: cookieSecure,
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 1 week
    })
}

export async function clearAuthToken() {
    const cookieStore = await cookies()
    cookieStore.delete('auth_token')
}

// ── Refresh token (local auth) ───────────────────────────────────────────────
// Stored in its own httpOnly cookie. The opaque refresh token rotates on each use.

export async function getRefreshToken() {
    const cookieStore = await cookies()
    return cookieStore.get('refresh_token')?.value
}

export async function setRefreshToken(token: string) {
    const cookieStore = await cookies()
    const cookieSecure =
        process.env.COOKIE_SECURE !== undefined
            ? process.env.COOKIE_SECURE === 'true'
            : process.env.NODE_ENV === 'production'
    cookieStore.set('refresh_token', token, {
        httpOnly: true,
        secure: cookieSecure,
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
    })
}

export async function clearRefreshToken() {
    const cookieStore = await cookies()
    cookieStore.delete('refresh_token')
}

/** Rotate the refresh token for a fresh access token. Returns the new session or null. */
export async function refreshSession() {
    const refresh_token = await getRefreshToken()
    if (!refresh_token) return null

    const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token }),
    })
    if (!res.ok) {
        await clearAuthToken()
        await clearRefreshToken()
        return null
    }
    const session = await res.json()
    await setAuthToken(session.access_token)
    if (session.refresh_token) await setRefreshToken(session.refresh_token)
    return session
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
    const refresh_token = await getRefreshToken()
    if (token) {
        await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh_token }),
        })
    }

    await clearAuthToken()
    await clearRefreshToken()
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
        body: JSON.stringify({ email, redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/update-password` }),
    })

    if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Failed to send reset email')
    }

    return res.json()
}

/** Reset a password using the token from the email link (unauthenticated flow). */
export async function resetPassword(token: string, password: string) {
    const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
    })

    if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Failed to reset password')
    }

    return res.json()
}
