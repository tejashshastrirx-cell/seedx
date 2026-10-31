import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
export const URL = env.VITE_SUPABASE_URL
export const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY
export const PW = env.E2E_DEMO_PASSWORD
export const users = {
  hostel: 'hostel.buyer@seedx.example', restaurant: 'restaurant.buyer@seedx.example', dhruv: 'dhruv.farmer@seedx.example',
  kavita: 'kavita.farmer@seedx.example', raghav: 'raghav.farmer@seedx.example', transport: 'transport.partner@seedx.example', admin: 'admin.demo@seedx.example',
}

/** A real authenticated Supabase client for a demo user (publishable key + user JWT; RLS applies). */
export async function clientFor(email: string) {
  const c = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PW })
  if (error) throw error
  return c
}

export async function uiLogin(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PW)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL('**/dashboard')
}
