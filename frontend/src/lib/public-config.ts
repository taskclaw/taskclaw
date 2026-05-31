// Per-install PUBLIC config, injected at runtime by the root layout as
// `window.__TASKCLAW__` (see frontend/src/app/layout.tsx). It is intentionally
// NOT baked into the JS bundle via NEXT_PUBLIC_* — that is what lets a single
// published image work on any host AND carry a per-install Supabase anon key
// (each self-hosted box generates a unique JWT_SECRET, so the anon key differs
// per install and must be delivered at runtime).

export interface PublicConfig {
  /** Supabase anon JWT (safe to expose) — used by the browser client for auth + realtime. */
  anonKey: string
  /** "community" | "cloud" */
  edition: string
  brandName: string
}

declare global {
  interface Window {
    __TASKCLAW__?: PublicConfig
  }
}

const FALLBACK: PublicConfig = { anonKey: '', edition: 'community', brandName: 'TaskClaw' }

/** Read the runtime-injected public config (browser only; falls back on the server). */
export function getPublicConfig(): PublicConfig {
  if (typeof window === 'undefined') return FALLBACK
  return window.__TASKCLAW__ ?? FALLBACK
}
