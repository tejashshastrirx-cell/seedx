// Tidies the demo lot from the aborted first take using normal app actions (no deletes).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path')
const L = 'https://seedxsss.tejash-shastri-rx.workers.dev'
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const LISTING = '' + (process.argv[2]) + '', ORDER = '' + (process.argv[3]) + ''
;(async () => {
  const b = await chromium.launch()
  const login = async (email) => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c.addInitScript(() => localStorage.setItem('seedx.prefs.v1', JSON.stringify({ lang: 'en' }))); const p = await c.newPage(); await p.goto(L + '/login'); await p.getByLabel('Email').fill(email); await p.getByLabel('Password').fill(env.E2E_DEMO_PASSWORD); await p.getByRole('button', { name: 'Log in' }).click(); await p.waitForURL('**/dashboard'); return p }
  const f = await login('dhruv.farmer@seedx.example'), bu = await login('hostel.buyer@seedx.example')
  await f.goto(`${L}/farmer/harvest/${LISTING}/edit`); await f.getByLabel('Listing title').waitFor()
  await f.getByLabel('Listing title').fill('Demo lot – tomatoes (video demo, take ' + process.argv[4] + ')'); await f.getByLabel('District').fill('Sehore')
  await f.getByRole('button', { name: /Save|Publish/ }).last().click(); await f.waitForTimeout(3000); console.log('edited', f.url())
  await f.goto(`${L}/orders/${ORDER}`); await f.getByRole('button', { name: 'Schedule pickup' }).click(); await f.waitForTimeout(2500)
  await f.getByRole('button', { name: 'Mark in transit' }).click(); await f.waitForTimeout(2500)
  await bu.goto(`${L}/orders/${ORDER}`); await bu.getByRole('button', { name: 'Confirm receipt' }).click(); await bu.waitForTimeout(3000)
  console.log('buyer buttons', await bu.getByRole('button').allInnerTexts())
  await f.goto(`${L}/farmer/harvest`); await f.waitForLoadState('networkidle')
  const card = f.locator('li', { hasText: 'video demo, take ' + process.argv[4] }).first()
  const w = card.getByRole('button', { name: 'Withdraw' }); if (await w.count()) { await w.click(); await f.waitForTimeout(2500); console.log('withdrawn') } else console.log('no withdraw button; buttons:', await card.getByRole('button').allInnerTexts())
  await b.close()
})().catch((e) => { console.error(e.message); process.exit(1) })
