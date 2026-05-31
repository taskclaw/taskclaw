import { NextRequest } from 'next/server'
import { getAuthToken } from '@/lib/auth'
import { serverApiBase } from '@/lib/api-base'

const API_URL = serverApiBase()

export const dynamic = 'force-dynamic'

/**
 * BFF SSE proxy (Epic 4) — replaces the Supabase Realtime browser client.
 *
 * The browser opens an EventSource to this same-origin route (so the httpOnly
 * auth_token cookie is available). We read the cookie, attach it as a Bearer token,
 * and stream the backend's /events/stream SSE response straight through.
 */
export async function GET(req: NextRequest) {
    const token = await getAuthToken()
    if (!token) {
        return new Response('Unauthorized', { status: 401 })
    }

    const upstream = await fetch(`${API_URL}/events/stream`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: req.signal,
    })

    if (!upstream.ok || !upstream.body) {
        return new Response('Upstream events unavailable', { status: 502 })
    }

    return new Response(upstream.body, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    })
}
