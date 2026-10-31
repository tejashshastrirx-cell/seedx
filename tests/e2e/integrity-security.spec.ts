import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { KEY, URL, clientFor, users } from './helpers'

test('two simultaneous acceptances cannot oversell; replay returns the same order', async () => {
  const farmer = await clientFor(users.raghav)
  const [b1, b2] = await Promise.all([clientFor(users.hostel), clientFor(users.restaurant)])
  const { data: wheat } = await farmer.from('commodities').select('id').eq('code', 'wheat').single()
  const id = crypto.randomUUID()
  const until = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const ins = await farmer.from('harvest_listings').insert({ id, farmer_id: (await farmer.auth.getUser()).data.user!.id, commodity_id: wheat!.id, title: 'E2E race lot', grade: 'A', unit: 'quintal',
    total_quantity: 10, min_price_paise_per_unit: 250000, available_until: until, state: 'Madhya Pradesh', district: 'Raisen', approx_lat: 23.33, approx_lng: 77.79, status: 'published' })
  expect(ins.error).toBeNull()
  const o1 = await b1.rpc('submit_offer', { p_listing_id: id, p_quantity: 8, p_price_paise_per_unit: 260000 })
  const o2 = await b2.rpc('submit_offer', { p_listing_id: id, p_quantity: 8, p_price_paise_per_unit: 265000 })
  expect(o1.error).toBeNull(); expect(o2.error).toBeNull()

  const k1 = `race-${crypto.randomUUID()}`, k2 = `race-${crypto.randomUUID()}`
  const [r1, r2] = await Promise.all([
    farmer.rpc('accept_offer', { p_offer_id: (o1.data as { id: string }).id, p_idempotency_key: k1 }),
    farmer.rpc('accept_offer', { p_offer_id: (o2.data as { id: string }).id, p_idempotency_key: k2 }),
  ])
  const wins = [r1, r2].filter((r) => !r.error && (r.data as { ok: boolean }).ok)
  expect(wins).toHaveLength(1)
  const loser = [r1, r2].find((r) => r !== wins[0])!
  expect(loser.error?.hint ?? (loser.data as { error?: string })?.error).toMatch(/INSUFFICIENT_STOCK|OFFER_NOT_OPEN/)

  const { data: lot } = await farmer.from('harvest_listings').select('available_quantity,reserved_quantity,sold_quantity,total_quantity').eq('id', id).single()
  expect(Number(lot!.reserved_quantity)).toBe(8)
  expect(Number(lot!.available_quantity)).toBe(2)

  const winnerKey = wins[0] === r1 ? k1 : k2, winnerOffer = wins[0] === r1 ? o1 : o2
  const replay = await farmer.rpc('accept_offer', { p_offer_id: (winnerOffer.data as { id: string }).id, p_idempotency_key: winnerKey })
  expect((replay.data as { order_id: string; replayed: boolean }).order_id).toBe((wins[0].data as { order_id: string }).order_id)
  expect((replay.data as { replayed: boolean }).replayed).toBe(true)
  const { count } = await farmer.from('orders').select('id', { count: 'exact', head: true }).eq('listing_id', id)
  expect(count).toBe(1)

  // Cancelling releases the reservation exactly once; then the lot can be withdrawn.
  const cancel = await farmer.rpc('transition_order', { p_order_id: (wins[0].data as { order_id: string }).order_id, p_to_status: 'cancelled', p_note: 'E2E cleanup' })
  expect(cancel.error).toBeNull()
  const { data: released } = await farmer.from('harvest_listings').select('available_quantity,reserved_quantity').eq('id', id).single()
  expect(Number(released!.available_quantity)).toBe(10); expect(Number(released!.reserved_quantity)).toBe(0)
  expect((await farmer.from('harvest_listings').update({ status: 'withdrawn' }).eq('id', id)).error).toBeNull()
})

test('live security probes are denied', async ({ request }) => {
  const anon = createClient(URL, KEY, { auth: { persistSession: false } })
  expect((await anon.from('orders').select('id')).error?.code).toBe('42501')
  expect((await anon.from('profile_private').select('id')).error?.code).toBe('42501')
  expect((await anon.rpc('accept_offer', { p_offer_id: crypto.randomUUID(), p_idempotency_key: 'anon-attempt-1' })).error).not.toBeNull()

  const buyer = await clientFor(users.restaurant)
  const me = (await buyer.auth.getUser()).data.user!.id
  expect((await buyer.from('user_roles').insert({ user_id: me, role: 'admin', status: 'active' })).error).not.toBeNull()
  expect((await buyer.rpc('request_role', { p_role: 'admin' })).error?.hint).toBe('ROLE_NOT_REQUESTABLE')
  expect((await buyer.rpc('admin_overview')).error?.hint).toBe('ADMIN_AAL2_REQUIRED')
  expect((await buyer.from('audit_logs').select('id')).data ?? []).toHaveLength(0)
  // Another buyer's orders and private pickup addresses are invisible.
  const hostel = await clientFor(users.hostel)
  const hostelOrders = (await hostel.from('orders').select('id')).data ?? []
  if (hostelOrders.length) expect((await buyer.from('orders').select('id').in('id', hostelOrders.map((o) => o.id))).data).toHaveLength(0)
  // Admin without MFA (aal1) is refused.
  const admin = await clientFor(users.admin)
  expect((await admin.rpc('admin_overview')).error?.hint).toBe('ADMIN_AAL2_REQUIRED')
  // A farmer cannot write inventory columns directly.
  const farmer = await clientFor(users.dhruv)
  const { data: mine } = await farmer.from('harvest_listings').select('id').limit(1)
  expect((await farmer.from('harvest_listings').update({ available_quantity: 99999 }).eq('id', mine![0].id)).error?.code).toBe('42501')
  // Price below the farmer minimum is rejected by the server.
  const { data: lot } = await buyer.from('harvest_listings').select('id,min_price_paise_per_unit').not('min_price_paise_per_unit', 'is', null).eq('status', 'published').limit(1).single()
  expect((await buyer.rpc('submit_offer', { p_listing_id: lot!.id, p_quantity: 1, p_price_paise_per_unit: lot!.min_price_paise_per_unit! - 100 })).error?.hint).toBe('BELOW_MIN_PRICE')
  // Edge Function: no token -> 401, untrusted origin -> 403.
  const fn = `${URL}/functions/v1/run-clustercart`
  expect((await request.post(fn, { data: { demand_id: crypto.randomUUID() }, headers: { apikey: KEY } })).status()).toBe(401)
  const token = (await buyer.auth.getSession()).data.session!.access_token
  expect((await request.post(fn, { data: { demand_id: crypto.randomUUID() }, headers: { apikey: KEY, Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })).status()).toBe(403)
})
