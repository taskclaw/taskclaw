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
const supabaseAnonKey = typeof window !== 'undefined' ? getPublicConfig().anonKey : ''

// Single browser client instance for Realtime subscriptions
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
})
