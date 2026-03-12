import { NextResponse, type NextRequest } from 'next/server'

function isJwtExpired(token: string): boolean {
    try {
        const parts = token.split('.')
        if (parts.length < 2) return true

        const payload = parts[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')

        const decoded = JSON.parse(atob(payload))
        if (!decoded?.exp) return true

        return Date.now() >= decoded.exp * 1000
    } catch {
        return true
    }
}

export async function middleware(request: NextRequest) {
    const token = request.cookies.get('auth_token')?.value
    const pathname = request.nextUrl.pathname
    const hasValidToken = !!token && !isJwtExpired(token)

    // If token exists but is expired/invalid, clear auth-related cookies once.
    if (token && !hasValidToken) {
        const url = request.nextUrl.clone()
        if (pathname !== '/login') {
            url.pathname = '/login'
        }
        const response = NextResponse.redirect(url)
        response.cookies.delete('auth_token')
        response.cookies.delete('current_account_id')
        response.cookies.delete('onboarding_completed')
        return response
    }

    // Protect dashboard routes
    if (!hasValidToken && pathname.startsWith('/dashboard')) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // Protect onboarding route
    if (!hasValidToken && pathname.startsWith('/onboarding')) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // Check onboarding completion for dashboard routes
    if (hasValidToken && pathname.startsWith('/dashboard')) {
        const onboardingCompleted = request.cookies.get('onboarding_completed')?.value
        if (onboardingCompleted === 'false') {
            const url = request.nextUrl.clone()
            url.pathname = '/onboarding'
            return NextResponse.redirect(url)
        }
    }

    // Redirect authenticated users away from login/signup
    if (hasValidToken && (pathname === '/login' || pathname === '/signup')) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    // Redirect authenticated users from / to /dashboard (smart redirect handles single board)
    if (hasValidToken && pathname === '/') {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
