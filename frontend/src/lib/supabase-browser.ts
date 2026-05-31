'use client'

import { createClient } from '@supabase/supabase-js'
import { getPublicConfig } from './public-config'

// Same-origin Supabase access through the Kong gateway (/auth/v1, /rest/v1,
// /realtime/v1) with the per-install anon key injected at runtime — so one
// published image works on localhost, any IP, or any domain with no rebuild.
// SSR-safe: on the server we evaluate to a harmless placeholder (this client
// is only USED in the browser, inside realtime hooks).
const supabaseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
// createClient THROWS on a falsy key ("supabaseKey is required"). This module is
// a client component, but Next still evaluates it during SSR — where the runtime
// public config (window.__TASKCLAW__) isn't available — so fall back to a
// non-empty placeholder. The client is only USED in the browser (realtime hooks),
// where the real per-install anon key is present, so the placeholder is never
// used for an actual request. The `||` also keeps a missing key from crashing.
const supabaseAnonKey =
    (typeof window !== 'undefined' ? getPublicConfig().anonKey : '') ||
    'ssr-placeholder-anon-key'

// Single browser client instance for Realtime subscriptions
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
})
