// SEED X CodeStorm pitch deck generator (pptxgenjs). No speaker notes by design.
const pptxgen = require('pptxgenjs')
const path = require('path')
const { applyTheme } = require('/root/.claude/skills/synced/6553101c-e840-4ce8-ba1a-736eeb5d014f_d0e78f91-0b1b-4320-a869-d3cbf7019100/pptx/scripts/apply_theme.js')

const IMG = (f) => path.join(__dirname, 'img', f)
const A = (f) => path.join(__dirname, 'assets', f)
const OUT = path.join(__dirname, 'SEED_X_Hackathon_Presentation.pptx')

const THEME = {
  name: 'SEED X Harvest', headFontFace: 'Calibri', bodyFontFace: 'Calibri',
  colors: { dk1: '1D2621', lt1: 'FFFFFF', dk2: '174B35', lt2: 'F5F0E4', accent1: '174B35', accent2: 'E5A63B', accent3: '2F7A55',
    accent4: 'A33A2A', accent5: '7F5310', accent6: 'E6F1E7', hlink: '1F5A3D', folHlink: '7F5310' },
}
// Palette (hex for the few options that need it)
const FOREST = '174B35', DEEP = '0E2E21', GOLD = 'E5A63B', GOLD_INK = '7F5310', CREAM = 'F5F0E4', MINT = 'E6F1E7', INK = '1D2621', MUTED = '56625B', RED = 'A33A2A', WHITE = 'FFFFFF'

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE' // 13.333 x 7.5
pres.title = 'SEED X - CodeStorm Hackathon'
pres.author = 'Tejash Shastri and Shaurya'
pres.company = 'SEED X'
pres.theme = { headFontFace: 'Calibri', bodyFontFace: 'Calibri' }

pres.defineSlideMaster({ title: 'LIGHT', background: { color: WHITE },
  objects: [{ text: { text: 'SEED X', options: { x: 11.6, y: 7.02, w: 1.2, h: 0.3, fontSize: 10, bold: true, color: FOREST, align: 'right', charSpacing: 2 } } }],
  slideNumber: { x: 12.85, y: 7.02, w: 0.35, h: 0.3, fontSize: 10, color: MUTED } })
pres.defineSlideMaster({ title: 'DARK', background: { color: DEEP } })

const W = 13.333
const title = (s, text, opts = {}) => s.addText(text, { x: 0.6, y: 0.4, w: W - 1.2, h: 0.95, fontSize: 36, bold: true, color: opts.color ?? FOREST, margin: 0, isTextBox: true, valign: 'top', fit: 'none' })
const kicker = (s, text, color = GOLD_INK) => s.addText(text.toUpperCase(), { x: 0.6, y: 0.12, w: 8, h: 0.3, fontSize: 11, bold: true, color, charSpacing: 3, margin: 0, isTextBox: true })
const foot = (s, text, color = MUTED) => s.addText(text, { x: 0.6, y: 6.86, w: 10.8, h: 0.5, fontSize: 9.5, color, margin: 0, isTextBox: true, valign: 'top' })
const box = (s, x, y, w, h, fill, opts = {}) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: opts.line ?? fill, width: opts.lineW ?? 0.75 }, rectRadius: opts.r ?? 0.12, shadow: opts.shadow ? { type: 'outer', blur: 6, offset: 2, angle: 90, color: '000000', opacity: 0.12 } : undefined })
const txt = (s, text, x, y, w, h, o = {}) => s.addText(text, { x, y, w, h, fontSize: 15, color: INK, margin: 0, isTextBox: true, valign: 'top', ...o })
const arrow = (s, x, y, w, color = GOLD) => s.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color, width: 2.5, endArrowType: 'triangle' } })
const pic = (s, file, x, y, w, h, alt, opts = {}) => s.addImage({ path: file, x, y, w, h, altText: alt, rounding: false, ...opts })

// ---------------------------------------------------------------- 1 HOOK
{
  const s = pres.addSlide({ masterName: 'DARK' })
  pic(s, IMG('hero.jpg'), 0, 0, W, 7.5, 'Golden-hour Indian farm with a collection centre and truck (concept illustration)')
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 8.4, h: 7.5, fill: { color: DEEP, transparency: 18 }, line: { color: DEEP, transparency: 100 } })
  txt(s, 'SEED X', 0.7, 0.6, 5, 0.5, { fontSize: 20, bold: true, color: GOLD, charSpacing: 6 })
  txt(s, 'A farmer’s harvest should not lose value before it reaches the buyer.', 0.7, 1.55, 7.4, 2.9, { fontSize: 42, bold: true, color: WHITE, valign: 'top' })
  txt(s, 'Better Farming Starts with Better Connections.', 0.7, 4.55, 7.4, 0.5, { fontSize: 20, color: GOLD, bold: true })
  txt(s, 'CodeStorm Hackathon · Agriculture, FoodTech & Rural Development', 0.7, 5.15, 7.4, 0.4, { fontSize: 14, color: CREAM })
  txt(s, 'Created & Developed by Tejash Shastri and Shaurya', 0.7, 6.55, 6, 0.4, { fontSize: 13, color: CREAM })
  box(s, 11.05, 4.95, 1.75, 2.15, WHITE, { r: 0.1 })
  pic(s, A('seedx_qr_verified.png'), 11.2, 5.05, 1.45, 1.45, 'QR code linking to the live SEED X site')
  txt(s, 'Live demo', 11.05, 6.55, 1.75, 0.4, { fontSize: 11, bold: true, color: FOREST, align: 'center' })
}

// ---------------------------------------------------------------- 2 VALUE GAP
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'The problem')
  title(s, 'The value gap is real')
  txt(s, 'Estimated share of the consumer rupee that reaches the farmer', 0.6, 1.35, 8, 0.4, { fontSize: 16, color: MUTED })
  const stats = [['33%', 'Tomato'], ['36%', 'Onion'], ['37%', 'Potato']]
  stats.forEach(([n, c], i) => {
    const x = 0.6 + i * 2.75
    box(s, x, 1.95, 2.45, 2.25, i === 0 ? FOREST : MINT, { r: 0.15 })
    txt(s, n, x, 2.15, 2.45, 1.15, { fontSize: 66, bold: true, align: 'center', color: i === 0 ? GOLD : FOREST })
    txt(s, c, x, 3.35, 2.45, 0.5, { fontSize: 20, bold: true, align: 'center', color: i === 0 ? WHITE : FOREST })
  })
  txt(s, [{ text: 'Roughly two-thirds ', options: { bold: true, color: RED } }, { text: 'of what a consumer pays for these vegetables is estimated to go beyond the farm gate.' }], 0.6, 4.45, 8, 0.8, { fontSize: 18 })
  // chain
  const chain = ['Farmer', 'Traders & intermediaries', 'Transport & storage', 'Retailer', 'Consumer']
  chain.forEach((c, i) => {
    const y = 1.95 + i * 0.95
    box(s, 9.35, y, 3.35, 0.68, i === 0 ? GOLD : i === 4 ? FOREST : CREAM, { r: 0.1 })
    txt(s, c, 9.35, y, 3.35, 0.68, { fontSize: 15, bold: true, align: 'center', valign: 'middle', color: i === 4 ? WHITE : INK })
    if (i < 4) s.addShape(pres.shapes.LINE, { x: 11.02, y: y + 0.7, w: 0, h: 0.24, line: { color: GOLD_INK, width: 2, endArrowType: 'triangle' } })
  })
  txt(s, 'Price rises at every hand-off', 9.35, 6.7 - 0.0, 3.35, 0.3, { fontSize: 11, italic: true, color: MUTED, align: 'center' })
  foot(s, 'Source: RBI Working Paper 08/2024 (3 Oct 2024), "Vegetables Inflation in India: A Study of Tomato, Onion and Potato"; figures also cited in a Rajya Sabha answer (29 Nov 2024). Estimates from specific value-chain studies, not a universal figure for every crop, state or transaction.')
}

// ---------------------------------------------------------------- 3 WHY IT PERSISTS
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'Root cause')
  title(s, 'The problem is not just selling. It is coordination')
  const items = [
    ['01', 'Too few buyers in view', 'Farmers may not see enough competing buyer demand.'],
    ['02', 'Small lots are hard to find', 'Buyers struggle to find suitable local supply and small lots.'],
    ['03', 'Fragmented pickups', 'Separate trips for small orders can raise per-unit logistics cost.'],
    ['04', 'Perishables lose value fast', 'Handling, transport and storage risks hit produce every day it waits.'],
  ]
  items.forEach(([n, h, d], i) => {
    const x = 0.6 + (i % 2) * 4.15, y = 1.6 + Math.floor(i / 2) * 2.45
    box(s, x, y, 3.9, 2.2, i % 3 === 0 ? MINT : CREAM, { r: 0.14 })
    txt(s, n, x + 0.3, y + 0.25, 1, 0.45, { fontSize: 18, bold: true, color: GOLD_INK })
    txt(s, h, x + 0.3, y + 0.7, 3.4, 0.5, { fontSize: 19, bold: true, color: FOREST })
    txt(s, d, x + 0.3, y + 1.25, 3.35, 0.85, { fontSize: 15, color: INK })
  })
  // broken chain visual
  box(s, 9.2, 1.6, 3.55, 4.65, FOREST, { r: 0.16 })
  txt(s, 'Today', 9.5, 1.85, 3, 0.4, { fontSize: 14, bold: true, color: GOLD })
  const nodes = [['Farm A', 2.45], ['Farm B', 3.25], ['Farm C', 4.05]]
  nodes.forEach(([n, y]) => {
    box(s, 9.5, y, 1.2, 0.55, MINT, { r: 0.08 }); txt(s, n, 9.5, y, 1.2, 0.55, { fontSize: 12, bold: true, align: 'center', valign: 'middle', color: FOREST })
    s.addShape(pres.shapes.LINE, { x: 10.75, y: y + 0.28, w: 0.75, h: 0, line: { color: GOLD, width: 2, dashType: 'dash' } })
    txt(s, '✕', 11.5, y + 0.02, 0.4, 0.5, { fontSize: 18, bold: true, color: 'F2B8A8' })
  })
  txt(s, '3 trips · 3 small sales · no shared view of demand', 9.5, 4.9, 3.05, 0.9, { fontSize: 13, color: CREAM })
  foot(s, 'Context: Govt. of India / NABCONS post-harvest loss study (PIB, MoFPI, 1 Aug 2025) assessed losses across 54 crops at stages including collection, grading, packaging, transport and storage. SEED X is software; it does not build cold-chain infrastructure.')
}

// ---------------------------------------------------------------- 4 SOLUTION
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'The solution')
  title(s, 'One software workflow from harvest to buyer')
  const steps = ['Farmer lists available harvest', 'Buyers post requirements or make offers', 'SEED X checks crop, grade, quantity, location and timing', 'ClusterCart compares pooled vs separate delivery', 'NetBack shows farmer net and buyer landed cost', 'Order, stock and delivery events tracked']
  steps.forEach((t, i) => {
    const x = 0.6 + i * 2.06
    box(s, x, 1.75, 1.82, 2.55, i === 3 || i === 4 ? FOREST : MINT, { r: 0.14 })
    txt(s, String(i + 1), x + 0.2, 1.9, 0.6, 0.6, { fontSize: 30, bold: true, color: i === 3 || i === 4 ? GOLD : GOLD_INK })
    txt(s, t, x + 0.2, 2.6, 1.45, 1.6, { fontSize: 14.5, bold: true, color: i === 3 || i === 4 ? WHITE : FOREST })
    if (i < 5) arrow(s, x + 1.84, 3.02, 0.2, GOLD_INK)
  })
  txt(s, 'Supporting services', 0.6, 4.65, 4, 0.4, { fontSize: 14, bold: true, color: MUTED })
  const sup = ['Crop & inventory', 'My Clients / My Suppliers', 'Notifications', 'Seed store', 'Mandi prices', 'Govt. schemes', '10 languages']
  let x = 0.6, y = 5.05
  sup.forEach((t) => { const w = 0.4 + t.length * 0.105; if (x + w > 9.4) { x = 0.6; y += 0.6 } box(s, x, y, w, 0.48, CREAM, { r: 0.24 }); txt(s, t, x, y, w, 0.48, { fontSize: 13, align: 'center', valign: 'middle', color: INK }); x += w + 0.15 })
  box(s, 0.6, 6.25, 5.6, 0.55, GOLD, { r: 0.12 })
  txt(s, 'Software-only. No new hardware required.', 0.6, 6.25, 5.6, 0.55, { fontSize: 17, bold: true, align: 'center', valign: 'middle', color: DEEP })
  pic(s, IMG('problem.jpg'), 9.85, 4.65, 2.9, 1.62, 'Photo of the official CodeStorm problem statement slide')
  txt(s, 'Official challenge: "Multiple Intermediaries Reduce Farmers’ Earnings and Increase Consumer Prices"', 9.85, 6.32, 2.9, 0.55, { fontSize: 9.5, color: MUTED })
}

// ---------------------------------------------------------------- 5 CLUSTERCART
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'Special feature · ClusterCart')
  title(s, 'Many farms. Many buyers. One smarter allocation')
  // illustrative allocation
  box(s, 0.6, 1.55, 6.3, 4.35, MINT, { r: 0.16 })
  txt(s, 'Illustrative scenario', 0.85, 1.7, 4, 0.35, { fontSize: 12, bold: true, color: GOLD_INK })
  const farms = [['Farm 1', '80 kg'], ['Farm 2', '60 kg'], ['Farm 3', '100 kg']]
  const buyers = [['Hostel', '70 kg'], ['Restaurant', '90 kg'], ['Retailer', '80 kg']]
  farms.forEach(([n, q], i) => { const y = 2.25 + i * 1.0; box(s, 0.85, y, 1.6, 0.75, WHITE, { r: 0.1, line: 'C9DDCD' }); txt(s, `${n}\n${q}`, 0.85, y, 1.6, 0.75, { fontSize: 13, bold: true, align: 'center', valign: 'middle', color: FOREST }); arrow(s, 2.5, y + 0.37, 0.55, GOLD) })
  box(s, 3.1, 2.3, 1.45, 2.65, FOREST, { r: 0.14 })
  txt(s, 'Engine\nchecks', 3.1, 2.45, 1.45, 0.7, { fontSize: 14, bold: true, color: GOLD, align: 'center' })
  txt(s, 'crop · grade\nquantity\ndistance\nfreshness\ntime windows\ntransport cost', 3.1, 3.15, 1.45, 1.75, { fontSize: 11, color: WHITE, align: 'center' })
  buyers.forEach(([n, q], i) => { const y = 2.25 + i * 1.0; arrow(s, 4.6, y + 0.37, 0.55, GOLD); box(s, 5.2, y, 1.5, 0.75, WHITE, { r: 0.1, line: 'C9DDCD' }); txt(s, `${n}\n${q}`, 5.2, y, 1.5, 0.75, { fontSize: 13, bold: true, align: 'center', valign: 'middle', color: FOREST }) })
  txt(s, '240 kg supply = 240 kg demand. Pool only if the route is feasible and the estimated cost is lower; otherwise recommend separate trips.', 0.85, 5.15, 5.85, 0.7, { fontSize: 13, color: INK })
  // real run
  pic(s, IMG('cc_live.jpg'), 7.25, 1.55, 5.5, 4.05, 'Screenshot: live ClusterCart run recommending separate trips')
  box(s, 7.25, 5.72, 5.5, 0.95, FOREST, { r: 0.12 })
  txt(s, [{ text: 'Live run on demo data: ', options: { bold: true, color: GOLD } }, { text: 'pooling would cost 18.7% more, so the engine said NO and recommended separate trips. It explains every decision.', options: { color: WHITE } }], 7.45, 5.77, 5.15, 0.85, { fontSize: 13.5, valign: 'middle' })
  foot(s, 'Rule-based, explainable optimisation, not AI. Transport figures are estimates (straight-line distance × road factor, default rate card), not carrier quotes. Each farmer accepts their own offer.')
}

// ---------------------------------------------------------------- 6 NETBACK
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'NetBack intelligence')
  title(s, 'A higher offer is not always a better deal')
  txt(s, 'Illustrative example · farmer side', 0.6, 1.4, 6, 0.35, { fontSize: 13, bold: true, color: GOLD_INK })
  // waterfall: scale 2500 -> 4.0 in height
  const base = 6.0, k = 3.6 / 2500
  const bars = [['Accepted sale value', 2500, 0, FOREST, '₹2,500'], ['Seller-paid transport', 200, 2300, RED, '− ₹200'], ['Seller-paid packing', 50, 2250, RED, '− ₹50'], ['Estimated farmer net', 2250, 0, GOLD, '₹2,250']]
  bars.forEach(([l, v, from, c, lab], i) => {
    const x = 0.8 + i * 1.6, h = Math.max(v * k, 0.12), y = base - (from + v) * k
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 1.15, h, fill: { color: c }, line: { color: c } })
    txt(s, lab, x - 0.2, y - 0.45, 1.55, 0.4, { fontSize: 15, bold: true, align: 'center', color: c === GOLD ? GOLD_INK : c })
    txt(s, l, x - 0.25, base + 0.08, 1.65, 0.6, { fontSize: 11.5, align: 'center', color: INK })
  })
  s.addShape(pres.shapes.LINE, { x: 0.6, y: base, w: 6.4, h: 0, line: { color: MUTED, width: 1 } })
  // buyer side
  box(s, 7.3, 1.45, 2.75, 2.35, CREAM, { r: 0.14 })
  txt(s, 'Buyer compares landed cost', 7.5, 1.6, 2.4, 0.6, { fontSize: 14, bold: true, color: FOREST })
  txt(s, 'Sale value\n+ buyer-paid costs\n= landed cost', 7.5, 2.25, 2.4, 1.0, { fontSize: 14, color: INK })
  txt(s, 'Buyer-paid costs are never deducted from farmer net.', 7.5, 3.15, 2.4, 0.6, { fontSize: 11, italic: true, color: MUTED })
  box(s, 7.3, 4.0, 2.75, 2.0, FOREST, { r: 0.14 })
  txt(s, 'Farmers compare net proceeds. Buyers compare landed cost. Both see the same transparent breakdown.', 7.5, 4.15, 2.4, 1.75, { fontSize: 13.5, color: WHITE })
  pic(s, IMG('netback_live.jpg'), 10.3, 1.45, 2.45, 2.69, 'Screenshot: live NetBack panel on a tomato listing')
  txt(s, 'Live app: 300 kg tomatoes at ₹22/kg, seller pays transport → est. farmer net ₹6,300; buyer landed ₹6,600 (demo data, estimated costs)', 10.3, 4.2, 2.45, 1.4, { fontSize: 10.5, color: MUTED })
  foot(s, 'Illustrative numbers. Clearer offers and lower avoidable cost can create a path to better farmer outcomes and more affordable procurement; retail price pass-through is not guaranteed. Money is stored in whole paise.')
}

// ---------------------------------------------------------------- 7 WORKSPACE
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'Beyond a marketplace')
  title(s, 'A farmer’s daily business workspace')
  pic(s, IMG('dashboard.jpg'), 0.6, 1.5, 6.6, 4.92, 'Screenshot: live Farmer Command Centre with listings, orders and clients')
  const groups = [
    ['Manage', 'Harvest listings, 46-crop catalogue, available / reserved / sold stock that only changes through valid orders'],
    ['Grow relationships', 'My Clients for farmers, My Suppliers for buyers: lead → enquiry → active → repeat, private notes'],
    ['Complete trade', 'Offers, counter-offers, orders with timeline, logistics assignment, real-time notifications'],
    ['Find support', 'Seed store with honest badges, dated mandi prices, official scheme links'],
  ]
  groups.forEach(([h, d], i) => {
    const y = 1.5 + i * 1.25
    box(s, 7.5, y, 5.25, 1.1, i % 2 ? CREAM : MINT, { r: 0.12 })
    txt(s, h, 7.7, y + 0.1, 4.9, 0.4, { fontSize: 16, bold: true, color: FOREST })
    txt(s, d, 7.7, y + 0.5, 4.9, 0.6, { fontSize: 12.5, color: INK })
  })
  foot(s, 'All modules shown are working in the live app and covered by automated tests. Screenshot: demo farmer account (synthetic data).')
}

// ---------------------------------------------------------------- 8 ACCESSIBILITY
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'Inclusion')
  title(s, 'Designed for the farmer, not for a tech expert')
  const langs = ['English', 'हिन्दी', 'বাংলা', 'తెలుగు', 'मराठी', 'தமிழ்', 'ગુજરાતી', 'ಕನ್ನಡ', 'മലയാളം', 'ਪੰਜਾਬੀ']
  langs.forEach((l, i) => { const x = 0.6 + (i % 5) * 1.32, y = 1.5 + Math.floor(i / 5) * 0.68; box(s, x, y, 1.2, 0.55, i === 0 ? FOREST : MINT, { r: 0.25 }); txt(s, l, x, y, 1.2, 0.55, { fontSize: 15, bold: true, align: 'center', valign: 'middle', color: i === 0 ? WHITE : FOREST }) })
  txt(s, 'Ten languages live today in native scripts; core journeys fully translated, native-speaker review in progress.', 0.6, 2.95, 6.5, 0.65, { fontSize: 13, color: MUTED })
  const pts = ['Mobile-first, large readable controls', 'Short guided steps and clear kg / quintal units', 'Local-language labels, helpful empty and error states', 'Low-data design: works with 3D and animation off', 'Assisted onboarding via FPOs / cooperatives as a rollout pathway (not a claimed partnership)']
  s.addText(pts.map((p, i) => ({ text: p, options: { bullet: true, breakLine: i < pts.length - 1 } })), { x: 0.6, y: 3.65, w: 6.6, h: 2.3, fontSize: 15, color: INK, paraSpaceAfter: 6, margin: 0, isTextBox: true, valign: 'top' })
  box(s, 0.6, 6.0, 6.6, 0.75, CREAM, { r: 0.1 })
  txt(s, 'Validation plan: test core tasks with farmers in several languages; measure completion, errors and comprehension.', 0.8, 6.02, 6.3, 0.7, { fontSize: 12.5, valign: 'middle', color: FOREST, bold: true })
  pic(s, IMG('m_bn.jpg'), 7.7, 1.4, 2.35, 5.08, 'Screenshot: SEED X home page in Bengali on a phone')
  pic(s, IMG('m_ta.jpg'), 10.35, 1.4, 2.35, 5.08, 'Screenshot: SEED X marketplace in Tamil on a phone')
  foot(s, 'Context: IAMAI–Kantar "Internet in India 2024": 870 million users (98% of internet users) accessed Indic-language content in 2024. An all-internet-user statistic, not a farmer-specific survey. Screens: Bengali and Tamil, live app.')
}

// ---------------------------------------------------------------- 9 SECURITY
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'Security & trust')
  title(s, 'Trust is built into the transaction')
  const ctrls = [
    ['Verified accounts', 'Supabase Auth with email verification before any trading'],
    ['Server-side roles', 'Roles are trusted records; admin actions need two-factor login (MFA)'],
    ['Row Level Security', 'Enabled on all 40 tables: each user sees only their own private data'],
    ['No secrets in the browser', 'Only the public publishable key ships; secret keys stay server-side'],
    ['Atomic, idempotent orders', 'Stock reserved in one locked step; replays return the same order'],
    ['Private files & audit', 'Owner-only upload folders, type/size limits, append-only audit log'],
  ]
  ctrls.forEach(([h, d], i) => {
    const x = 0.6 + (i % 2) * 3.55, y = 1.5 + Math.floor(i / 2) * 1.62
    box(s, x, y, 3.35, 1.45, i % 3 === 1 ? CREAM : MINT, { r: 0.12 })
    txt(s, h, x + 0.2, y + 0.15, 3, 0.4, { fontSize: 15.5, bold: true, color: FOREST })
    txt(s, d, x + 0.2, y + 0.6, 3, 0.8, { fontSize: 12.5, color: INK })
  })
  box(s, 7.95, 1.5, 4.8, 4.7, '0B1F17', { r: 0.12 })
  txt(s, 'Proof, not a shield icon', 8.2, 1.65, 4.3, 0.4, { fontSize: 14, bold: true, color: GOLD })
  const lines = [
    ['✓', 'DB security tests', '141/141'],
    ['✓', 'B reads A’s private notes', 'denied'],
    ['✓', '2 buyers, last stock', '1 winner'],
    ['✓', 'Accept request replayed', 'same order'],
    ['✓', 'User calls admin action', 'denied'],
    ['✓', 'Upload to other’s folder', 'denied'],
    ['✓', 'Browser + a11y tests', '14/14'],
  ]
  lines.forEach(([c, l, r], i) => {
    const y = 2.2 + i * 0.53
    txt(s, c, 8.2, y, 0.3, 0.4, { fontSize: 13, bold: true, color: '7BD69B', fontFace: 'Courier New' })
    txt(s, l, 8.5, y, 2.85, 0.45, { fontSize: 12, color: 'E6F1E7', fontFace: 'Courier New' })
    txt(s, r, 11.35, y, 1.25, 0.45, { fontSize: 12, bold: true, color: GOLD, fontFace: 'Courier New', align: 'right' })
  })
  foot(s, 'From the project’s automated pgTAP and Playwright suites, run against the live database on 31 Oct 2026. No system is "unhackable"; these are the specific controls that are configured and tested.')
}

// ---------------------------------------------------------------- 10 ECOSYSTEM
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'Positioning')
  title(s, 'Complement the ecosystem. Improve the daily workflow')
  box(s, 0.6, 1.5, 3.9, 3.0, CREAM, { r: 0.14 })
  txt(s, 'Already exists', 0.85, 1.65, 3.4, 0.4, { fontSize: 13, bold: true, color: GOLD_INK })
  txt(s, 'e-NAM', 0.85, 2.05, 3.4, 0.45, { fontSize: 18, bold: true, color: FOREST })
  txt(s, 'National electronic trading portal linking APMC mandis: price discovery, transparent auctions, payments, logistics module.', 0.85, 2.5, 3.45, 1.0, { fontSize: 12.5 })
  txt(s, 'AGMARKNET / data.gov.in', 0.85, 3.5, 3.4, 0.45, { fontSize: 18, bold: true, color: FOREST })
  txt(s, 'Daily mandi minimum, maximum and modal prices.', 0.85, 3.95, 3.45, 0.5, { fontSize: 12.5 })
  arrow(s, 4.6, 3.0, 0.5, GOLD_INK)
  box(s, 5.2, 1.5, 7.55, 3.0, FOREST, { r: 0.14 })
  txt(s, 'Where SEED X focuses', 5.45, 1.65, 7, 0.4, { fontSize: 13, bold: true, color: GOLD })
  const f = ['A local farmer workflow linking inventory, buyer demand, multi-party allocation, NetBack, relationships, orders and notifications', 'Explainable pooled-delivery recommendation with a clear cost comparison, including when not to pool', 'Mobile-first, ten-language workspace that uses public benchmark data where available']
  s.addText(f.map((p, i) => ({ text: p, options: { bullet: true, breakLine: i < f.length - 1 } })), { x: 5.45, y: 2.1, w: 7.1, h: 2.3, fontSize: 14.5, color: WHITE, paraSpaceAfter: 8, margin: 0, isTextBox: true, valign: 'top' })
  txt(s, 'How it is built', 0.6, 4.8, 4, 0.4, { fontSize: 14, bold: true, color: MUTED })
  const tech = [['Frontend', 'Vite · React 19 · TypeScript · Tailwind'], ['Backend', 'Supabase Postgres · Auth · RLS · RPCs · Storage · Realtime · Edge Functions'], ['Hosting', 'Cloudflare Workers, auto-deploy from GitHub'], ['Visuals', 'Canvas 2D weather · Three.js for ClusterCart data only']]
  tech.forEach(([h, d], i) => { const x = 0.6 + i * 3.06; box(s, x, 5.25, 2.9, 1.35, MINT, { r: 0.12 }); txt(s, h, x + 0.18, 5.35, 2.6, 0.35, { fontSize: 13.5, bold: true, color: FOREST }); txt(s, d, x + 0.18, 5.72, 2.6, 0.85, { fontSize: 11.5 }) })
  foot(s, 'Sources: enam.gov.in (overview, FAQs incl. logistics); data.gov.in / AGMARKNET current daily mandi prices. SEED X does not claim to be the first digital mandi; it is complementary to public market infrastructure. Entirely software-based.')
}

// ---------------------------------------------------------------- 11 DEMO + IMPACT + CLOSE
{
  const s = pres.addSlide({ masterName: 'DARK' })
  kicker(s, 'Demo · impact · business', GOLD)
  title(s, 'Prove the journey in 60 seconds', { color: WHITE })
  const demo = ['Farmer’s tomato listing', 'Buyer requirement & offer', 'Run ClusterCart: see its checks', 'NetBack and buyer landed cost', 'Accept: stock, order and notification update']
  demo.forEach((d, i) => { const y = 1.5 + i * 0.62; txt(s, String(i + 1), 0.6, y, 0.45, 0.5, { fontSize: 20, bold: true, color: GOLD }); txt(s, d, 1.1, y + 0.05, 3.9, 0.5, { fontSize: 14.5, color: WHITE }) })
  box(s, 0.6, 4.75, 1.45, 1.45, WHITE, { r: 0.08 })
  pic(s, A('seedx_qr_verified.png'), 0.68, 4.83, 1.29, 1.29, 'QR code to the live SEED X site')
  txt(s, [{ text: 'Live: ', options: { bold: true, color: GOLD } }, { text: 'seedxsss.tejash-shastri-rx.workers.dev', options: { color: WHITE, hyperlink: { url: 'https://seedxsss.tejash-shastri-rx.workers.dev/' } } }, { text: '\nOffline backup: SEED_X_Demo_Backup.mp4 (79 s)', options: { color: CREAM } }], 2.2, 4.85, 3.2, 1.3, { fontSize: 12 })
  box(s, 5.55, 1.45, 3.45, 4.75, '173A2C', { r: 0.14 })
  txt(s, 'Pilot metrics we will measure', 5.75, 1.6, 3.1, 0.6, { fontSize: 14, bold: true, color: GOLD })
  const m = ['Farmer net proceeds per kg vs a comparable alternative', 'Buyer landed cost per kg', 'Transport cost per kg', 'Time to match', 'Order fill and on-time delivery rate', 'Repeat buyer rate', 'Unsold / spoiled quantity']
  s.addText(m.map((p, i) => ({ text: p, options: { bullet: true, breakLine: i < m.length - 1 } })), { x: 5.75, y: 2.2, w: 3.1, h: 3.9, fontSize: 12.5, color: WHITE, paraSpaceAfter: 5, margin: 0, isTextBox: true, valign: 'top' })
  box(s, 9.25, 1.45, 3.5, 4.75, GOLD, { r: 0.14 })
  txt(s, 'Proposed business model', 9.45, 1.6, 3.1, 0.4, { fontSize: 14, bold: true, color: DEEP })
  const b = [['Small fee per completed order', 'paid by buyers; free for farmers to list'], ['ClusterCart planning', 'for institutional buyers (hostels, canteens, retailers)'], ['Pilot first', 'one district, one crop cluster, partner FPO']]
  b.forEach(([h, d], i) => { const y = 2.1 + i * 1.3; txt(s, h, 9.45, y, 3.15, 0.45, { fontSize: 14, bold: true, color: DEEP }); txt(s, d, 9.45, y + 0.45, 3.15, 0.7, { fontSize: 12, color: '3A2A08' }) })
  txt(s, 'Proposed, not yet validated', 9.45, 5.75, 3.1, 0.35, { fontSize: 10.5, italic: true, color: '3A2A08' })
  txt(s, 'SEED X helps shorten the distance between a farmer’s harvest and a fairer market opportunity.', 0.6, 6.35, 12.1, 0.55, { fontSize: 18, bold: true, italic: true, color: GOLD })
  txt(s, 'Created & Developed by Tejash Shastri and Shaurya', 0.6, 6.95, 8, 0.35, { fontSize: 11, color: CREAM })
}

;(async () => {
  await pres.writeFile({ fileName: OUT })
  await applyTheme(OUT, THEME)
  console.log('wrote', OUT)
})()
