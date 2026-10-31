import { expect, test } from '@playwright/test'
import { resources } from '../../src/i18n/resources'
import { LANGUAGES } from '../../src/i18n/languages'
import { clientFor, pinLanguage, uiLogin, users } from './helpers'

type Msg = { nav: { marketplace: string }; lang: { choose: string } }
const msg = (code: string) => (resources as unknown as Record<string, { translation: Msg }>)[code].translation

test('all ten languages render in their own script and the choice survives a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  for (const l of LANGUAGES) {
    await page.getByTestId('language-select').first().selectOption(l.code)
    await expect(page.locator('html')).toHaveAttribute('lang', l.code)
    await expect(page.getByRole('link', { name: msg(l.code).nav.marketplace, exact: true }).first()).toBeVisible()
  }
  await page.getByTestId('language-select').first().selectOption('ta')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ta')
  await expect(page.getByRole('link', { name: msg('ta').nav.marketplace, exact: true }).first()).toBeVisible()
  expect(errors).toEqual([])
})

test('marketplace category, sort and demo filters query live data', async ({ page }) => {
  await pinLanguage(page)
  await page.goto('/marketplace')
  await expect(page.getByText(/\d+ results/)).toBeVisible()
  const aside = page.getByRole('complementary', { name: 'Filters' })
  await aside.getByLabel('Category').selectOption('cereal')
  await expect(page).toHaveURL(/cat=cereal/)
  await aside.getByLabel('Sort by').selectOption('price_asc')
  await expect(page).toHaveURL(/sort=price_asc/)
  await expect(page.locator('main ul > li dd.text-lg').first()).toBeVisible()
  const prices = await page.locator('main ul > li dd.text-lg').allInnerTexts()
  const nums = prices.map((p) => Number(p.replace(/[^\d.]/g, '')))
  expect(nums.length).toBeGreaterThan(0)
  expect([...nums].sort((a, b) => a - b)).toEqual(nums)
  // The dev project only holds labelled demo records, so hiding demo data must leave nothing.
  await aside.getByLabel('Hide demo records').click()
  await expect(page).toHaveURL(/real=1/)
  await expect(page.getByText('Nothing matches these filters.')).toBeVisible()
})

test('saved searches persist per user and can be removed', async ({ page }) => {
  await uiLogin(page, users.hostel)
  await page.goto('/marketplace?cat=pulse')
  const aside = page.getByRole('complementary', { name: 'Filters' })
  await expect(page.getByRole('button', { name: 'Reset cat' })).toHaveText(/Pulses/) // category names loaded
  await aside.getByRole('button', { name: 'Save this search' }).click()
  await expect(page.getByText('Search saved')).toBeVisible()
  const saved = aside.getByRole('button', { name: 'Pulses', exact: true })
  await expect(saved).toBeVisible()
  await page.reload()
  await expect(saved).toBeVisible()
  await aside.getByRole('button', { name: 'Delete Pulses' }).click()
  await expect(saved).toHaveCount(0)
  // Remove any leftovers from earlier runs of this test (own rows only; RLS-scoped).
  const c = await clientFor(users.hostel)
  await c.from('saved_searches').delete().in('name', ['pulse', 'Pulses'])
})

test('My Suppliers notes are private to the buyer', async ({ page }) => {
  const buyer = await clientFor(users.hostel)
  const { data: list, error } = await buyer.rpc('list_trade_contacts', { p_kind: 'supplier' })
  expect(error).toBeNull()
  test.skip(!list?.length, 'hostel buyer has no trading history yet (run core-journey first)')
  await uiLogin(page, users.hostel)
  await page.goto('/buyer/suppliers')
  const card = page.getByTestId('contact-list').locator('li').first()
  await card.getByRole('button', { name: 'Edit note' }).click()
  const note = `E2E private note ${Date.now()}`
  await card.getByLabel('Private note').fill(note)
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('contact-list')).toContainText(note) // server round-trip finished
  await page.reload()
  await expect(page.getByText(note)).toBeVisible()
  // The counterparty sees neither the row nor the note.
  const farmerId = (list as { counterparty_id: string }[])[0].counterparty_id
  const { data: farmerProfile } = await buyer.from('profiles').select('display_name').eq('id', farmerId).single()
  const email = farmerProfile?.display_name?.startsWith('Dhruv') ? users.dhruv : farmerProfile?.display_name?.startsWith('Kavita') ? users.kavita : users.raghav
  const farmer = await clientFor(email)
  const { data: leaked } = await farmer.from('trade_contacts').select('private_note').eq('private_note', note)
  expect(leaked).toEqual([])
  const { data: clients } = await farmer.rpc('list_trade_contacts', { p_kind: 'client' })
  expect((clients as { private_note: string | null }[]).some((c) => c.private_note === note)).toBe(false)
})

test('notification centre filters, archives and restores', async ({ page }) => {
  await uiLogin(page, users.dhruv)
  await page.goto('/notifications')
  await page.getByRole('button', { name: 'Offers', exact: true }).click()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  const list = page.getByTestId('notification-list')
  await expect(list.or(page.getByText('You are all caught up.'))).toBeVisible()
  test.skip(!(await list.count()), 'no notifications for this demo user')
  const first = list.locator('li').first()
  const title = await first.locator('a').first().innerText()
  await first.getByRole('button', { name: 'Archive' }).click()
  await page.getByRole('tab', { name: 'Archived' }).click()
  const archived = page.getByTestId('notification-list').locator('li', { hasText: title }).first()
  await expect(archived).toBeVisible()
  await archived.getByRole('button', { name: 'Move to inbox' }).click()
  await page.getByRole('tab', { name: 'Inbox' }).click()
  await expect(page.getByTestId('notification-list').locator('li', { hasText: title }).first()).toBeVisible()
})

test('crop catalogue admin needs MFA in the UI and on the server', async ({ page }) => {
  const admin = await clientFor(users.admin)
  const { error } = await admin.rpc('admin_upsert_commodity', { p_code: 'e2e_crop', p_category: 'other', p_names: { en: 'E2E' }, p_default_unit: 'kg', p_shelf_life_days: 5 })
  expect(error?.code).toBe('42501')
  const farmer = await clientFor(users.dhruv)
  const { error: e2 } = await farmer.from('commodities').update({ is_active: false }).eq('code', 'wheat')
  expect(e2).not.toBeNull()
  await uiLogin(page, users.admin)
  await page.goto('/admin/catalogue')
  await expect(page.getByText('Admin pages need an MFA-verified session.')).toBeVisible()
})

test('catalogue lists every required crop with translations for anyone', async ({ request }) => {
  const { URL, KEY } = await import('./helpers')
  const r = await request.get(`${URL}/rest/v1/commodities?select=code,names&is_active=eq.true`, { headers: { apikey: KEY } })
  expect(r.ok()).toBe(true)
  const rows = (await r.json()) as { code: string; names: Record<string, string> }[]
  for (const code of ['green_chilli', 'capsicum', 'pomegranate', 'millets', 'urad', 'sesame', 'sunflower', 'vegetable_other', 'oilseed_other']) {
    const row = rows.find((x) => x.code === code)
    expect(row, code).toBeTruthy()
    expect(Object.keys(row!.names).sort()).toEqual(LANGUAGES.map((l) => l.code).sort())
  }
})

test('storage rejects disallowed file types and other users\' folders', async () => {
  const farmer = await clientFor(users.dhruv)
  const uid = (await farmer.auth.getUser()).data.user!.id
  const txt = new Blob(['not an image'], { type: 'text/plain' })
  const bad = await farmer.storage.from('harvest-images').upload(`${uid}/e2e/${Date.now()}.txt`, txt, { contentType: 'text/plain' })
  expect(bad.error).not.toBeNull()
  const other = await clientFor(users.kavita)
  const otherId = (await other.auth.getUser()).data.user!.id
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' })
  const foreign = await farmer.storage.from('harvest-images').upload(`${otherId}/e2e/${Date.now()}.png`, png, { contentType: 'image/png' })
  expect(foreign.error).not.toBeNull()
  const guess = await farmer.storage.from('private-user-documents').download(`${otherId}/doc/id.pdf`)
  expect(guess.error).not.toBeNull()
})
