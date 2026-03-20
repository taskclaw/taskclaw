import { NextResponse } from 'next/server'
import { setAuthToken } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // if "next" is in param, use it as the redirect URL
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        try {
            const res = await fetch(`${API_URL}/auth/exchange-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code }),
            })

            if (res.ok) {
                const session = await res.json()
                // We need to set the cookie. Since this is a Route Handler, we can use cookies() or response headers.
                // But setAuthToken uses cookies() which is read-only in Route Handlers? 
                // Wait, cookies() in Next.js App Router: "You can read and write cookies using cookies()."
                // Let's verify. Yes, in Server Actions and Route Handlers, cookies() is read-write.

                // However, setAuthToken is async.
                await setAuthToken(session.access_token)

                const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
                const isLocalEnv = process.env.NODE_ENV === 'development'
                if (isLocalEnv) {
                    // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
                    return NextResponse.redirect(`${origin}${next}`)
                } else if (forwardedHost) {
                    return NextResponse.redirect(`https://${forwardedHost}${next}`)
                } else {
                    return NextResponse.redirect(`${origin}${next}`)
                }
            }
        } catch (error) {
            console.error('Exchange code error:', error)
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
