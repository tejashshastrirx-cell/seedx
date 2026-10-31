import { expect, test } from '@playwright/test'
import { clientFor, uiLogin, users } from './helpers'

// Full farmer-to-buyer journey through the real UI against the live Supabase project:
// requirement -> server-side ClusterCart run -> offers -> farmer accepts (atomic reservation) -> pickup -> transit -> buyer confirms receipt.
test('buyer requirement to delivered order, through the UI', async ({ page, browser }) => {
  const tag = `E2E ${Date.now().toString(36)}`

  await uiLogin(page, users.hostel)
  await page.goto('/buyer/requirements')
  await page.getByRole('button', { name: 'Post a requirement' }).first().click()
  await page.getByLabel('Crop').selectOption({ label: 'Wheat' })
  await page.getByLabel('Listing title').fill(`${tag} wheat for mess`)
  await page.getByLabel('Quantity needed').fill('5')
  await page.getByLabel(/Maximum price/).fill('2900')
  await page.getByLabel('Delivery district').fill('Bhopal')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(`${tag} wheat for mess`)).toBeVisible()

  // Run ClusterCart on the server (Edge Function) - must be a saved run, not a local preview.
  await page.locator('li', { hasText: `${tag} wheat for mess` }).getByRole('link', { name: 'Run ClusterCart' }).click()
  await page.getByRole('button', { name: 'Run ClusterCart' }).click()
  await expect(page.getByText(/Saved run .* algorithm clustercart-1\.0\.0/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Preview (not saved)')).toHaveCount(0)
  await page.getByRole('button', { name: 'Send offers to these farmers' }).click()
  await expect(page.getByText(/offers sent/)).toBeVisible()

  // Which farmers received offers for this requirement? (buyer can read their own offers under RLS)
  const buyer = await clientFor(users.hostel)
  const { data: demand } = await buyer.from('demand_requests').select('id').eq('title', `${tag} wheat for mess`).single()
  const { data: offers } = await buyer.from('offers').select('id,farmer_id,quantity,listing_id').eq('demand_id', demand!.id)
  expect(offers!.length).toBeGreaterThan(0)
  const { data: profiles } = await buyer.from('profiles').select('id,display_name').in('id', offers!.map((o) => o.farmer_id))
  const farmerName = profiles![0].display_name
  const email = farmerName.startsWith('Dhruv') ? users.dhruv : farmerName.startsWith('Kavita') ? users.kavita : users.raghav
  const target = offers!.find((o) => o.farmer_id === profiles![0].id)!

  // Farmer accepts in their own browser session.
  const farmerCtx = await browser.newContext()
  const fp = await farmerCtx.newPage()
  await uiLogin(fp, email)
  const farmer = await clientFor(email)
  const before = await farmer.from('harvest_listings').select('available_quantity,reserved_quantity').eq('id', target.listing_id).single()
  await fp.goto('/farmer/offers')
  const card = fp.locator('li', { hasText: 'ClusterCart pooled proposal' }).filter({ has: fp.getByRole('button', { name: 'Accept & reserve' }) }).first()
  await card.getByRole('button', { name: 'Accept & reserve' }).click()
  await fp.waitForURL('**/orders/*')
  await expect(fp.getByText('Confirmed').first()).toBeVisible()
  const orderUrl = fp.url()

  const after = await farmer.from('harvest_listings').select('available_quantity,reserved_quantity').eq('id', target.listing_id).single()
  expect(Number(after.data!.reserved_quantity)).toBeCloseTo(Number(before.data!.reserved_quantity) + Number(target.quantity), 3)
  expect(Number(after.data!.available_quantity)).toBeCloseTo(Number(before.data!.available_quantity) - Number(target.quantity), 3)

  await fp.getByRole('button', { name: 'Schedule pickup' }).click()
  await expect(fp.getByText('Pickup scheduled').first()).toBeVisible()
  await fp.getByRole('button', { name: 'Mark in transit' }).click()
  await expect(fp.getByText('In transit').first()).toBeVisible()

  // Buyer confirms receipt - the proof of delivery.
  await page.goto(new URL(orderUrl).pathname)
  await page.getByRole('button', { name: 'Confirm receipt' }).click()
  await expect(page.getByText('Delivered').first()).toBeVisible()
  const sold = await farmer.from('harvest_listings').select('sold_quantity').eq('id', target.listing_id).single()
  expect(Number(sold.data!.sold_quantity)).toBeGreaterThanOrEqual(Number(target.quantity))
  await farmerCtx.close()
})
