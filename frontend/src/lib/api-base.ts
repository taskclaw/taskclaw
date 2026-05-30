// Single source of truth for the backend API base URL.
//
// The published frontend image is HOST-PORTABLE: it bakes NO host-specific
// URLs at build time. Behind TaskClaw's single-origin Kong gateway:
//   - in the browser  -> same-origin `${window.location.origin}/api`
//                        (Kong routes /api -> backend), so the same bundle
//                        works on localhost, any IP, or any domain.
//   - on the server   -> the backend container directly over the Docker
//                        network (INTERNAL_API_URL, default http://backend:3003),
//                        never back out through the public gateway.
//
// Read at RUNTIME, not inlined at build — do not reintroduce NEXT_PUBLIC_* here.

/** API base for server-side code (server actions, route handlers, RSC). */
export function serverApiBase(): string {
  return process.env.INTERNAL_API_URL || 'http://backend:3003'
}

/** API base for browser code — same-origin through the Kong gateway. */
export function clientApiBase(): string {
  if (typeof window === 'undefined') return serverApiBase()
  return `${window.location.origin}/api`
}
