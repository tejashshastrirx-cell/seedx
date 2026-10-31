import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** True when the browser-safe Supabase settings are present. Only publishable keys belong here. */
export const supabaseConfigured = Boolean(url && key)

export const supabase = createClient<Database>(url ?? 'http://localhost:54321', key ?? 'missing-publishable-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})

export const SUPABASE_URL = url ?? ''
