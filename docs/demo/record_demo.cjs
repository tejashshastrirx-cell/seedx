// SEED X real-website demo recorder.
// Headed Chromium on Xvfb, captured with ffmpeg x11grab (1920x1080, 30 fps). Every action is a real
// Playwright interaction against the live site. A client-side pointer visualisation is injected into
// the recording browser only (it follows the real mouse events); nothing is changed on the site.
// Usage: DISPLAY=:99 node record_demo.cjs [--dry]   (--dry = verify selectors, no writes, no recording)
const { chromium } = require('playwright')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const DRY = process.argv.includes('--dry')
const L = 'https://seedxsss.tejash-shastri-rx.workers.dev'
const OUT = path.join(__dirname, 'raw')
fs.mkdirSync(OUT, { recursive: true })
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const PW = env.E2E_DEMO_PASSWORD
const FARMER = 'dhruv.farmer@seedx.example', BUYER = 'hostel.buyer@seedx.example'
const SCALE = 1.25 // --force-device-scale-factor: CSS px -> screen px
const LOT = 'Demo lot – tomatoes (video demo)'

const CURSOR = () => {
  const install = () => {
    if (document.getElementById('__sx_cur')) return
    const wrap = document.createElement('div'); wrap.id = '__sx_cur'
    wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform'
    wrap.innerHTML = '<div style="position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;background:rgba(229,166,59,.28);box-shadow:0 0 0 2px rgba(229,166,59,.55)"></div>' +
      '<svg width="30" height="30" viewBox="0 0 24 24" style="position:absolute;left:-3px;top:-2px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.45))"><path d="M3 2l6.8 19.2 2.6-7.6 7.6-2.6z" fill="#fff" stroke="#0E2E21" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    document.documentElement.appendChild(wrap)
    let p = { x: -100, y: -100 }
    try { p = JSON.parse(sessionStorage.getItem('__sx_pos') || 'null') || p } catch {}
    wrap.style.transform = `translate(${p.x}px,${p.y}px)`
    addEventListener('mousemove', (e) => { wrap.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; try { sessionStorage.setItem('__sx_pos', JSON.stringify({ x: e.clientX, y: e.clientY })) } catch {} }, true)
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div')
      r.style.cssText = `position:fixed;left:${e.clientX - 10}px;top:${e.clientY - 10}px;width:20px;height:20px;border-radius:50%;border:3px solid #E5A63B;z-index:2147483646;pointer-events:none;transition:all .45s ease-out;opacity:1`
      document.documentElement.appendChild(r)
      requestAnimationFrame(() => { r.style.left = `${e.clientX - 28}px`; r.style.top = `${e.clientY - 28}px`; r.style.width = '56px'; r.style.height = '56px'; r.style.opacity = '0' })
      setTimeout(() => r.remove(), 600)
    }, true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let rec = null, segStart = 0, segName = '', events = []
function startSeg(name) {
  segName = name; events = []; segStart = Date.now()
  if (DRY) { console.log('SEG', name); return Promise.resolve() }
  rec = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1920x1080', '-framerate', '30', '-i', process.env.DISPLAY || ':99',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-pix_fmt', 'yuv420p', path.join(OUT, `${name}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] })
  return sleep(800).then(() => { segStart = Date.now() })
}
async function endSeg() {
  fs.writeFileSync(path.join(OUT, `${segName}.json`), JSON.stringify({ name: segName, duration: (Date.now() - segStart) / 1000, events }, null, 1))
  if (DRY) return
  await sleep(400)
  rec.stdin.write('q'); await new Promise((r) => rec.on('close', r))
}
const mark = (label, box) => { events.push({ t: +((Date.now() - segStart) / 1000).toFixed(2), label, box: box ? { x: Math.round(box.x * SCALE), y: Math.round(box.y * SCALE), w: Math.round(box.width * SCALE), h: Math.round(box.height * SCALE) } : undefined }) }

async function moveTo(page, loc, label) {
  await loc.scrollIntoViewIfNeeded(); await sleep(250)
  const b = await loc.boundingBox()
  if (!b) throw new Error('no box for ' + label)
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 28 })
  if (label) mark(label, b)
  return b
}
async function click(page, loc, label, pause = 450) { await moveTo(page, loc, label); await sleep(pause); await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(350) }
async function type(page, loc, text, label, delay = 55) { await click(page, loc, label, 250); await loc.fill(''); await page.keyboard.type(text, { delay }) }
async function select(page, loc, opt, label) { await moveTo(page, loc, label); await sleep(400); await loc.selectOption(opt); await sleep(600) }
async function scroll(page, dy, steps = 8, wait = 90) { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(wait) } await sleep(300) }
async function hover(page, loc, label, hold = 1200) { await moveTo(page, loc, label); await sleep(hold) }

;(async () => {
  const WIN = ['--disable-save-password-bubble', '--password-store=basic', '--disable-features=PasswordManagerOnboarding,AutofillServerCommunication', '--window-position=0,0', '--window-size=1536,864', `--force-device-scale-factor=${SCALE}`, '--no-first-run', '--lang=en-IN', '--hide-scrollbars', '--disable-infobars']
  // ------------------------------------------------ seg01: real address bar (normal browser window)
  {
    const b = await chromium.launch({ headless: DRY, args: WIN })
    const ctx = await b.newContext({ viewport: DRY ? { width: 1536, height: 760 } : null })
    await ctx.addInitScript(() => { try { localStorage.setItem('seedx.prefs.v1', JSON.stringify({ lang: 'en' })) } catch {} })
    const p = await ctx.newPage()
    await p.goto('about:blank')
    await startSeg('seg01_url')
    await p.goto(L + '/', { waitUntil: 'networkidle' }); mark('url_visible')
    await sleep(5500)
    await endSeg(); await b.close()
  }
  // One app-mode window (no browser chrome) covering the whole 1920x1080 screen. Accounts are switched
  // off camera by swapping the Supabase session in localStorage (captured from real on-camera logins).
  const udd = fs.mkdtempSync('/tmp/sxrec-')
  fs.mkdirSync(path.join(udd, 'Default'), { recursive: true })
  fs.writeFileSync(path.join(udd, 'Default', 'Preferences'), JSON.stringify({ credentials_enable_service: false, profile: { password_manager_enabled: false }, autofill: { profile_enabled: false } }))
  const ctx = await chromium.launchPersistentContext(udd, { headless: DRY, viewport: DRY ? { width: 1536, height: 864 } : null, locale: 'en-IN', args: [...WIN, '--app=data:text/html,<body style="background:%23F5F0E4">'] })
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('seedx.prefs.v1')) localStorage.setItem('seedx.prefs.v1', JSON.stringify({ lang: 'en' })) } catch {} })
  await ctx.addInitScript(CURSOR)
  const page = ctx.pages()[0] || await ctx.newPage()
  const anon = page, farmer = page, buyer = page
  const sessions = {}
  const saveSession = async (who) => { sessions[who] = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('sb-')).map((k) => [k, localStorage.getItem(k)]))) }
  const useSession = async (who, url) => {
    await page.goto(L + '/about', { waitUntil: 'domcontentloaded' })
    await page.evaluate((s) => { for (const k of Object.keys(localStorage)) if (k.startsWith('sb-')) localStorage.removeItem(k); for (const [k, v] of Object.entries(s || {})) localStorage.setItem(k, v) }, sessions[who])
    await page.goto(L + url, { waitUntil: 'networkidle' }); await sleep(800)
  }
  await page.goto(L + '/', { waitUntil: 'networkidle' }); await page.mouse.move(760, 430)

  // ------------------------------------------------ seg02: home
  await anon.reload({ waitUntil: 'networkidle' }); await anon.mouse.move(980, 520)
  await startSeg('seg02_home')
  await sleep(3500); mark('hero')
  await hover(anon, anon.getByRole('link', { name: 'I am a farmer' }).first(), 'cta_farmer', 1400)
  await hover(anon, anon.getByRole('link', { name: 'I buy produce' }).first(), 'cta_buyer', 1200)
  await hover(anon, anon.getByTestId('language-select').first(), 'language', 1200)
  await scroll(anon, 700, 10, 120); await sleep(2000); mark('live_counts')
  await scroll(anon, 800, 10, 120); await sleep(2200); mark('journey')
  await scroll(anon, -1500, 10, 80); await sleep(1200)
  await endSeg()

  // ------------------------------------------------ seg03: registration guide + login
  await startSeg('seg03_register')
  await click(anon, anon.getByRole('link', { name: 'Create account' }).first(), 'create_account')
  await anon.waitForURL('**/signup'); await sleep(1200); mark('signup_form')
  await type(anon, anon.getByLabel('Your name or business name'), 'Ramesh (new farmer, demo)', 'field_name')
  await type(anon, anon.getByLabel('Email'), 'new.farmer@example.test', 'field_email', 45)
  await type(anon, anon.getByLabel('Password', { exact: true }), 'DemoOnly-Video-2026', 'field_password', 35)
  await type(anon, anon.getByLabel('Confirm password'), 'DemoOnly-Video-2026', 'field_confirm', 35)
  await hover(anon, anon.getByRole('button', { name: 'Create account' }).last(), 'submit_not_clicked', 1800)
  mark('verification_note'); await sleep(3500)
  await click(anon, anon.getByRole('link', { name: 'Log in' }).first(), 'go_login'); await anon.waitForURL('**/login'); await sleep(900); mark('switch_to_demo_account')
  await type(farmer, farmer.getByLabel('Email'), FARMER, 'login_email', 40)
  await type(farmer, farmer.getByLabel('Password'), PW, 'login_password', 40)
  await click(farmer, farmer.getByRole('button', { name: 'Log in' }), 'login_click')
  await farmer.waitForURL('**/dashboard'); await sleep(2500); mark('dashboard_reached'); await saveSession('farmer')
  await hover(farmer, farmer.getByText('Set up your account'), 'roles', 1000)
  await hover(farmer, farmer.getByText('Farmer - sell my harvest').first(), 'farmer_role_active', 2200)
  await endSeg()

  // ------------------------------------------------ seg04: farmer dashboard + listing
  await farmer.evaluate(() => scrollTo(0, 0)); await sleep(500)
  await startSeg('seg04_farmer')
  await sleep(1200); mark('command_centre')
  await hover(farmer, farmer.getByText('Farmer Command Centre'), 'centre_title', 1500)
  await hover(farmer, farmer.getByTestId('role-centres').getByText('Open listings').first(), 'stat_listings', 1200)
  await click(farmer, farmer.getByRole('link', { name: 'My harvest' }).first(), 'nav_my_harvest')
  await farmer.waitForURL('**/farmer/harvest'); await sleep(2000)
  const tomato = farmer.getByText('Fresh hybrid tomatoes').first()
  await hover(farmer, tomato, 'tomato_900', 2500)
  await click(farmer, farmer.getByRole('link', { name: 'List a harvest' }).first(), 'new_listing')
  await farmer.waitForURL('**/harvest/new'); await sleep(1500); mark('form_open')
  await select(farmer, farmer.getByLabel('Crop'), { label: 'टमाटर (Tomato)' }, 'field_crop').catch(async () => select(farmer, farmer.getByLabel('Crop'), { label: 'Tomato' }, 'field_crop'))
  await type(farmer, farmer.getByLabel('Listing title'), LOT, 'field_title', 35)
  await select(farmer, farmer.getByLabel('Grade'), 'A', 'field_grade')
  await select(farmer, farmer.getByLabel('Unit'), 'kg', 'field_unit')
  await type(farmer, farmer.getByLabel('Total quantity'), '500', 'field_qty')
  await type(farmer, farmer.getByLabel(/Minimum price/), '18', 'field_min_price')
  await type(farmer, farmer.getByLabel(/Asking price/), '22', 'field_asking')
  await type(farmer, farmer.getByLabel(/Seller packing\/handling cost/), '1', 'field_handling')
  await select(farmer, farmer.getByLabel('State'), 'Madhya Pradesh', 'field_state')
  await type(farmer, farmer.getByLabel('District'), 'Sehore', 'field_district')
  await hover(farmer, farmer.getByText('Private pickup details'), 'private_pickup', 1500)
  if (!DRY) {
    await click(farmer, farmer.getByRole('button', { name: 'Publish' }), 'publish')
    await farmer.waitForURL((u) => !u.pathname.endsWith('/new'), { timeout: 30000 }); await sleep(2000)
    await farmer.goto(L + '/farmer/harvest'); await farmer.waitForLoadState('networkidle'); await sleep(1200)
    await hover(farmer, farmer.getByText(LOT).first(), 'lot_saved', 2500)
  } else { await hover(farmer, farmer.getByRole('button', { name: 'Publish' }), 'publish_dry', 500) }
  await endSeg()

  // ------------------------------------------------ seg05: buyer workspace + offer form
  sessions.none = {}; await useSession('none', '/login')
  await startSeg('seg05_buyer')
  await type(buyer, buyer.getByLabel('Email'), BUYER, 'login_email', 40)
  await type(buyer, buyer.getByLabel('Password'), PW, 'login_password', 40)
  await click(buyer, buyer.getByRole('button', { name: 'Log in' }), 'login_click')
  await buyer.waitForURL('**/dashboard'); await sleep(2000); mark('buyer_dashboard'); await saveSession('buyer')
  await hover(buyer, buyer.getByText('Buyer Procurement Centre'), 'procurement_centre', 1500)
  await click(buyer, buyer.getByRole('link', { name: 'Requirements' }).first(), 'nav_requirements')
  await buyer.waitForURL('**/buyer/requirements'); await sleep(1800)
  await hover(buyer, buyer.getByText('Monthly wheat for hostel mess').first(), 'requirement', 2000)
  await click(buyer, buyer.getByRole('link', { name: 'Marketplace' }).first(), 'nav_marketplace')
  await buyer.waitForURL('**/marketplace'); await sleep(1500)
  const aside = buyer.getByRole('complementary', { name: 'Filters' })
  await type(buyer, aside.getByLabel('Search'), 'tomato', 'search', 90); await buyer.keyboard.press('Enter'); await sleep(2000); mark('search_results')
  const lotLink = buyer.getByRole('link', { name: DRY ? /Fresh hybrid tomatoes/ : new RegExp(LOT.replace(/[()]/g, '.')) }).first()
  await click(buyer, lotLink, 'open_lot')
  await buyer.getByText('Make an offer').first().waitFor(); await sleep(1500); mark('listing_detail')
  await type(buyer, buyer.getByLabel(/Quantity \(kg\)/), '300', 'offer_qty', 120)
  await type(buyer, buyer.getByLabel(/Your price/), '22', 'offer_price', 120)
  await select(buyer, buyer.getByLabel(/Delivery terms/), { label: 'Seller pays transport' }, 'offer_terms')
  await endSeg()

  // ------------------------------------------------ seg06: NetBack + submit
  await startSeg('seg06_netback')
  const panel = buyer.getByRole('region', { name: 'NetBack' }).first()
  await panel.scrollIntoViewIfNeeded(); await sleep(1500)
  mark('netback_panel', await panel.boundingBox())
  await hover(buyer, panel.getByText('Estimated farmer net').first(), 'farmer_net', 3500)
  await hover(buyer, panel.getByText('Buyer landed cost').first(), 'buyer_landed', 3500)
  await click(buyer, panel.locator('summary').first(), 'view_breakdown'); await sleep(1500)
  mark('breakdown_open', await panel.boundingBox())
  await hover(buyer, panel.locator('details').getByText('Estimated farmer net').first(), 'farmer_net_row', 2500)
  await hover(buyer, panel.locator('details').getByText('Buyer landed cost').first(), 'buyer_landed_row', 2500)
  const bm = panel.getByText(/Mandi benchmark/).first()
  if (await bm.count()) await hover(buyer, bm, 'mandi_ref', 2000)
  const nbText = await panel.innerText().catch(() => '')
  fs.writeFileSync(path.join(OUT, 'netback_values.txt'), nbText)
  if (!DRY) {
    await click(buyer, buyer.getByRole('button', { name: 'Make an offer' }), 'submit_offer')
    await buyer.getByText(/Offer sent/).first().waitFor({ timeout: 20000 }).catch(() => {}); mark('offer_sent'); await sleep(2500)
  }
  await endSeg()

  // ------------------------------------------------ seg07: ClusterCart (separate wheat scenario)
  await startSeg('seg07_clustercart')
  await click(buyer, buyer.getByRole('link', { name: 'ClusterCart' }).first(), 'nav_clustercart')
  await buyer.waitForURL('**/matching'); await sleep(1500)
  const sel = buyer.getByLabel('Choose one of your requirements')
  const wheat = (await sel.locator('option').allInnerTexts()).find((o) => /Monthly wheat/i.test(o))
  await select(buyer, sel, { label: wheat }, 'pick_wheat')
  await click(buyer, buyer.getByRole('button', { name: 'Run ClusterCart' }), 'run', 700)
  await buyer.getByText('Recommendation').first().waitFor({ timeout: 60000 }); await sleep(1500); mark('result')
  await hover(buyer, buyer.getByText('Recommendation').first().locator('xpath=..'), 'recommendation', 2500)
  await hover(buyer, buyer.getByText('Separate trips').nth(1), 'separate_cost', 1800)
  await hover(buyer, buyer.getByText('Pooled route').first(), 'pooled_cost', 1800)
  await scroll(buyer, 420, 8, 110)
  await hover(buyer, buyer.getByText('Why this match?'), 'why', 1200)
  await hover(buyer, buyer.getByText(/below the 5% threshold|Pooling would/).first(), 'reason_pooling', 3500)
  await hover(buyer, buyer.getByText(/Hard constraints checked first/).first(), 'reason_checks', 2500)
  await scroll(buyer, 520, 8, 110)
  await hover(buyer, buyer.getByText(/Grade A meets minimum/).first(), 'checks_table', 2500)
  fs.writeFileSync(path.join(OUT, 'clustercart_values.txt'), await buyer.locator('main').innerText())
  await endSeg()

  // ------------------------------------------------ seg08: farmer reviews + accepts, order progress
  if (!DRY) {
    await useSession('farmer', '/dashboard')
    await startSeg('seg08_order')
    await hover(farmer, farmer.getByRole('link', { name: /Notifications/ }).first(), 'bell', 1500)
    await click(farmer, farmer.getByRole('link', { name: 'Offers' }).first(), 'nav_offers')
    await farmer.waitForURL('**/farmer/offers'); await sleep(1500)
    const card = farmer.locator('li', { hasText: LOT }).first()
    await card.scrollIntoViewIfNeeded(); await sleep(800); mark('offer_card', await card.boundingBox())
    await hover(farmer, card.getByText(/₹22/).first(), 'offer_price', 1800)
    await hover(farmer, card.getByRole('button', { name: 'Counter' }), 'counter_option', 1000)
    await hover(farmer, card.getByRole('button', { name: 'Reject' }), 'reject_option', 1000)
    await click(farmer, card.getByRole('button', { name: 'Accept & reserve' }), 'accept', 800)
    await farmer.getByText(/stock reserved/i).first().waitFor({ timeout: 20000 }).catch(() => {}); mark('accepted_toast'); await sleep(2500)
    await farmer.waitForURL('**/orders/**', { timeout: 30000 }); await sleep(2000); mark('order_page')
    await hover(farmer, farmer.getByText('Agreed terms'), 'terms', 1500)
    await hover(farmer, farmer.getByText('Timeline').first(), 'timeline', 1500)
    await click(farmer, farmer.getByRole('button', { name: 'Schedule pickup' }), 'schedule_pickup')
    await sleep(2500); mark('pickup_scheduled')
    await click(farmer, farmer.getByRole('button', { name: 'Mark in transit' }), 'in_transit')
    await sleep(2500); mark('in_transit_done')
    const orderUrl = farmer.url()
    await endSeg()
    await useSession('buyer', new URL(orderUrl).pathname)
    await startSeg('seg08b_buyer_order'); await sleep(1200); mark('buyer_order')
    await click(buyer, buyer.getByRole('button', { name: 'Confirm receipt' }), 'confirm_receipt')
    await sleep(2500); mark('delivered')
    await hover(buyer, buyer.getByText('Timeline').first(), 'timeline_final', 2500)
    fs.writeFileSync(path.join(OUT, 'order_url.txt'), orderUrl)
    await endSeg()
    await useSession('farmer', '/farmer/harvest')
    await startSeg('seg08c_stock'); await sleep(1500)
    await hover(farmer, farmer.getByText(LOT).first(), 'stock_after', 3000)
    await endSeg()
  }

  // ------------------------------------------------ seg09: relationships
  await useSession('farmer', '/farmer/clients')
  await startSeg('seg09_relationships')
  await sleep(1500); mark('my_clients')
  await hover(farmer, farmer.getByText('Annapurna Hostel Mess (demo)').first(), 'client_hostel', 2500)
  await endSeg()
  await useSession('buyer', '/buyer/suppliers')
  await startSeg('seg09b_suppliers'); await sleep(1500); mark('my_suppliers')
  await hover(buyer, buyer.getByText('Dhruv (demo farmer)').first(), 'supplier_dhruv', 2500)
  await endSeg()

  // ------------------------------------------------ seg10: Hindi
  await useSession('farmer', '/dashboard')
  await startSeg('seg10_hindi')
  await moveTo(farmer, farmer.getByTestId('language-select').first(), 'language'); await sleep(600)
  await farmer.getByTestId('language-select').first().selectOption('hi'); await sleep(2500); mark('hindi_dashboard')
  await hover(farmer, farmer.getByTestId('role-centres'), 'hindi_centre', 2000)
  await click(farmer, farmer.getByRole('link', { name: 'बाज़ार' }).first(), 'hindi_marketplace')
  await sleep(2500); mark('hindi_market')
  await hover(farmer, farmer.locator('main ul > li').first(), 'hindi_card', 2500)
  await endSeg()
  if (!DRY) { await farmer.getByTestId('language-select').first().selectOption('en'); await sleep(800) }
  await ctx.close()
  console.log('done')
})().catch((e) => { console.error('FAILED in', segName, e.message); try { rec && rec.stdin.write('q') } catch {} ; process.exit(1) })
