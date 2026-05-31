import { NextRequest } from 'next/server'
import { serverApiBase } from '@/lib/api-base'
import { getAuthToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Single-origin API gateway (replaces Kong after the Supabase removal).
 *
 * The published frontend image is the only public origin; the browser calls
 * `<origin>/api/...` (clientApiBase) and this catch-all proxies to the backend
 * over the Docker network. Auth is local + httpOnly: the browser can't read the
 * `auth_token` cookie, so this proxy attaches it as a Bearer token server-side.
 *
 * The more specific `/api/events` SSE route handler takes precedence over this
 * catch-all, so streaming keeps its own handler.
 */
async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const token = await getAuthToken()
  const search = req.nextUrl.search
  const target = `${serverApiBase()}/${path.join('/')}${search}`

  const headers = new Headers()
  const contentType = req.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  // Pass through an explicit API key if the caller sent one; otherwise use the cookie.
  const apiKey = req.headers.get('x-api-key')
  if (apiKey) headers.set('x-api-key', apiKey)
  else if (token) headers.set('authorization', `Bearer ${token}`)

  const method = req.method
  const hasBody = method !== 'GET' && method !== 'HEAD'

  const upstream = await fetch(target, {
    method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: 'manual',
    // @ts-expect-error - undici streaming option, ignored elsewhere
    duplex: 'half',
  })

  const resHeaders = new Headers()
  const ct = upstream.headers.get('content-type')
  if (ct) resHeaders.set('content-type', ct)
  const cd = upstream.headers.get('content-disposition')
  if (cd) resHeaders.set('content-disposition', cd)

  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  })
}

type Ctx = { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path)
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path)
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path)
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path)
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path)
}
