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
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 8.4, h: 7.5, fill: { color: DEEP, transparency: 15 }, line: { color: DEEP, transparency: 100 } })
  txt(s, 'SEED X', 0.7, 0.55, 5, 0.5, { fontSize: 20, bold: true, color: GOLD, charSpacing: 6 })
  box(s, 0.7, 1.25, 6.9, 0.85, '173A2C', { r: 0.14 })
  txt(s, 'You paid ₹40 for a kilo of tomatoes. How much reached the farmer?', 0.95, 1.25, 6.5, 0.85, { fontSize: 18, bold: true, italic: true, color: GOLD, valign: 'middle' })
  txt(s, 'A farmer’s harvest should not lose value before it reaches the buyer.', 0.7, 2.4, 7.4, 2.4, { fontSize: 40, bold: true, color: WHITE })
  txt(s, 'Better Farming Starts with Better Connections.', 0.7, 4.85, 7.4, 0.5, { fontSize: 20, color: GOLD, bold: true })
  txt(s, 'CodeStorm Hackathon · Agriculture, FoodTech & Rural Development', 0.7, 5.4, 7.4, 0.4, { fontSize: 14, color: CREAM })
  txt(s, 'Created & Developed by Tejash Shastri and Shaurya', 0.7, 6.6, 6, 0.4, { fontSize: 13, color: CREAM })
  box(s, 11.05, 4.95, 1.75, 2.15, WHITE, { r: 0.1 })
  pic(s, A('seedx_qr_verified.png'), 11.2, 5.05, 1.45, 1.45, 'QR code linking to the live SEED X site')
  txt(s, 'Live demo', 11.05, 6.55, 1.75, 0.4, { fontSize: 11, bold: true, color: FOREST, align: 'center' })
}

// ---------------------------------------------------------------- 2 VALUE GAP
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'The problem')
  title(s, 'Of your ₹40, the farmer may see about ₹13')
  // ₹40 -> ₹13 bar
  box(s, 0.6, 1.55, 8.4, 1.75, CREAM, { r: 0.14 })
  txt(s, 'You pay', 0.85, 1.7, 2, 0.35, { fontSize: 13, bold: true, color: MUTED })
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.85, y: 2.1, w: 7.9, h: 0.5, fill: { color: 'D9D3C4' }, line: { color: 'D9D3C4' }, rectRadius: 0.1 })
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.85, y: 2.1, w: 7.9 * 0.33, h: 0.5, fill: { color: FOREST }, line: { color: FOREST }, rectRadius: 0.1 })
  txt(s, '₹13 farmer', 0.95, 2.1, 2.5, 0.5, { fontSize: 15, bold: true, color: WHITE, valign: 'middle' })
  txt(s, '₹27 traders · transport · storage · shop', 3.65, 2.1, 5, 0.5, { fontSize: 15, bold: true, color: INK, valign: 'middle' })
  txt(s, '₹40', 8.0, 1.62, 0.8, 0.45, { fontSize: 18, bold: true, color: FOREST, align: 'right' })
  txt(s, 'Example at the RBI-estimated tomato share (33%)', 0.85, 2.75, 7.9, 0.35, { fontSize: 11.5, italic: true, color: MUTED })
  txt(s, 'Estimated share of the consumer rupee that reaches the farmer', 0.6, 3.55, 8.4, 0.4, { fontSize: 15, color: MUTED })
  const stats = [['33%', 'Tomato'], ['36%', 'Onion'], ['37%', 'Potato']]
  stats.forEach(([n, c], i) => {
    const x = 0.6 + i * 2.85
    box(s, x, 4.05, 2.55, 1.9, i === 0 ? FOREST : MINT, { r: 0.15 })
    txt(s, n, x, 4.15, 2.55, 1.05, { fontSize: 54, bold: true, align: 'center', color: i === 0 ? GOLD : FOREST })
    txt(s, c, x, 5.2, 2.55, 0.5, { fontSize: 18, bold: true, align: 'center', color: i === 0 ? WHITE : FOREST })
  })
  const chain = ['Farmer', 'Traders & intermediaries', 'Transport & storage', 'Retailer', 'Consumer']
  chain.forEach((c, i) => {
    const y = 1.55 + i * 0.92
    box(s, 9.45, y, 3.3, 0.66, i === 0 ? GOLD : i === 4 ? FOREST : CREAM, { r: 0.1 })
    txt(s, c, 9.45, y, 3.3, 0.66, { fontSize: 15, bold: true, align: 'center', valign: 'middle', color: i === 4 ? WHITE : INK })
    if (i < 4) s.addShape(pres.shapes.LINE, { x: 11.1, y: y + 0.68, w: 0, h: 0.22, line: { color: GOLD_INK, width: 2, endArrowType: 'triangle' } })
  })
  txt(s, 'Every hand-off takes a cut', 9.45, 6.2, 3.3, 0.3, { fontSize: 12, italic: true, color: MUTED, align: 'center' })
  foot(s, 'Source: RBI Working Paper 08/2024 (3 Oct 2024), "Vegetables Inflation in India: A Study of Tomato, Onion and Potato"; also cited in a Rajya Sabha answer (29 Nov 2024). Estimates from specific studies, not a universal figure for every crop, state or sale. ₹40 → ₹13 is an illustration.')
}

// ---------------------------------------------------------------- 3 WHY
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'The real reason')
  title(s, 'Middlemen win because they connect people')
  const items = [
    ['Dhruv can’t see the buyers', 'He sells to whoever comes to the village.'],
    ['Buyers can’t find small farmers', 'A hostel kitchen in Bhopal needs tomatoes every week, but can’t find farms like his.'],
    ['Three farms, three half-empty trips', 'Neighbours send small loads separately, so transport costs more per kilo.'],
    ['Tomatoes don’t wait', 'Every day the crop sits, it loses value.'],
  ]
  items.forEach(([h, d], i) => {
    const x = 0.6 + (i % 2) * 4.15, y = 1.55 + Math.floor(i / 2) * 2.45
    box(s, x, y, 3.9, 2.2, i % 3 === 0 ? MINT : CREAM, { r: 0.14 })
    txt(s, String(i + 1), x + 0.3, y + 0.22, 1, 0.45, { fontSize: 20, bold: true, color: GOLD_INK })
    txt(s, h, x + 0.3, y + 0.7, 3.35, 0.65, { fontSize: 18, bold: true, color: FOREST })
    txt(s, d, x + 0.3, y + 1.38, 3.35, 0.8, { fontSize: 14, color: INK })
  })
  box(s, 9.2, 1.55, 3.55, 4.65, FOREST, { r: 0.16 })
  pic(s, IMG('dhruv_avatar.png'), 10.2, 1.8, 1.55, 1.55, 'Dhruv, the SEED X farmer guide character')
  txt(s, 'What if Dhruv’s phone did the connecting, and Dhruv kept the value?', 9.45, 3.55, 3.05, 1.7, { fontSize: 19, bold: true, color: WHITE, align: 'center' })
  txt(s, 'That is SEED X.', 9.45, 5.4, 3.05, 0.5, { fontSize: 17, bold: true, color: GOLD, align: 'center' })
  foot(s, 'Context: Govt. of India / NABCONS post-harvest loss study (PIB, MoFPI, 1 Aug 2025) assessed losses across 54 crops at collection, grading, packaging, transport and storage. SEED X is software; it does not build cold storage.')
}

// ---------------------------------------------------------------- 4 DHRUV'S DAY
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'The solution')
  title(s, 'Meet Dhruv: his day on SEED X')
  pic(s, IMG('dhruv_card.jpg'), 0.6, 1.5, 2.75, 2.03, 'Dhruv guide card from the live SEED X home page: Namaste! I am Dhruv')
  txt(s, 'Dhruv is SEED X’s farmer guide. His story here is an example.', 0.6, 3.6, 2.75, 0.7, { fontSize: 11, italic: true, color: MUTED })
  const steps = [
    ['Morning', 'Lists 900 kg of tomatoes in Hindi', 'Sets a minimum price. His exact farm stays private.'],
    ['Same day', 'Hostel kitchen posts a need', '“300 kg of tomatoes every week.” Finds Dhruv by search & filters.'],
    ['Offer', 'Dhruv gets a notification', 'Accept, reject or counter with his own price, fair and on record.'],
    ['Deal', 'Stock reserved, order tracked', 'Pickup → on the way → delivered. The hostel becomes his client.'],
  ]
  steps.forEach(([k, h, d], i) => {
    const x = 3.65 + i * 2.32
    box(s, x, 1.5, 2.12, 3.0, i === 3 ? FOREST : MINT, { r: 0.14 })
    txt(s, k.toUpperCase(), x + 0.18, 1.62, 1.8, 0.35, { fontSize: 11, bold: true, color: i === 3 ? GOLD : GOLD_INK, charSpacing: 2 })
    txt(s, h, x + 0.18, 2.0, 1.8, 0.95, { fontSize: 15.5, bold: true, color: i === 3 ? WHITE : FOREST })
    txt(s, d, x + 0.18, 2.95, 1.8, 1.45, { fontSize: 12.5, color: i === 3 ? CREAM : INK })
    if (i < 3) arrow(s, x + 2.13, 3.0, 0.18, GOLD_INK)
  })
  txt(s, 'All in one app', 0.6, 4.75, 4, 0.4, { fontSize: 14, bold: true, color: MUTED })
  const sup = ['46 crops', 'Search & filters', 'Saved searches', 'Offers & counter-offers', 'Notifications', 'Private farm location', 'Order tracking']
  let x = 0.6, y = 5.2
  sup.forEach((t) => { const w = 0.4 + t.length * 0.105; if (x + w > 12.75) { x = 0.6; y += 0.6 } box(s, x, y, w, 0.48, CREAM, { r: 0.24 }); txt(s, t, x, y, w, 0.48, { fontSize: 13, align: 'center', valign: 'middle', color: INK }); x += w + 0.15 })
  box(s, 7.2, 6.2, 5.55, 0.55, GOLD, { r: 0.12 })
  txt(s, 'Software-only. Just the phone Dhruv already has.', 7.2, 6.2, 5.55, 0.55, { fontSize: 15.5, bold: true, align: 'center', valign: 'middle', color: DEEP })
}

// ---------------------------------------------------------------- 5 CLUSTERCART
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'ClusterCart · the smart truck')
  title(s, 'The smart truck that can say “no”')
  box(s, 0.6, 1.55, 6.3, 4.35, MINT, { r: 0.16 })
  txt(s, 'Example: should Dhruv and his neighbours share one truck?', 0.85, 1.7, 5.9, 0.4, { fontSize: 12.5, bold: true, color: GOLD_INK })
  const farms = [['Dhruv', '80 kg'], ['Neighbour', '60 kg'], ['Neighbour', '100 kg']]
  const buyers = [['Hostel', '70 kg'], ['Restaurant', '90 kg'], ['Shop', '80 kg']]
  farms.forEach(([n, q], i) => { const y = 2.25 + i * 1.0; box(s, 0.85, y, 1.6, 0.75, i === 0 ? GOLD : WHITE, { r: 0.1, line: 'C9DDCD' }); txt(s, `${n}\n${q}`, 0.85, y, 1.6, 0.75, { fontSize: 13, bold: true, align: 'center', valign: 'middle', color: FOREST }); arrow(s, 2.5, y + 0.37, 0.55, GOLD) })
  box(s, 3.1, 2.3, 1.45, 2.65, FOREST, { r: 0.14 })
  txt(s, 'Checks', 3.1, 2.42, 1.45, 0.45, { fontSize: 15, bold: true, color: GOLD, align: 'center' })
  txt(s, 'crop & quality\nquantity\ndistance\nfreshness\ntiming\ntruck cost', 3.1, 2.9, 1.45, 1.95, { fontSize: 12, color: WHITE, align: 'center' })
  buyers.forEach(([n, q], i) => { const y = 2.25 + i * 1.0; arrow(s, 4.6, y + 0.37, 0.55, GOLD); box(s, 5.2, y, 1.5, 0.75, WHITE, { r: 0.1, line: 'C9DDCD' }); txt(s, `${n}\n${q}`, 5.2, y, 1.5, 0.75, { fontSize: 13, bold: true, align: 'center', valign: 'middle', color: FOREST }) })
  txt(s, 'Share the truck only if it is really cheaper. If not, send separate trips, and say why.', 0.85, 5.15, 5.85, 0.7, { fontSize: 14, color: INK, bold: true })
  pic(s, IMG('cc_live.jpg'), 7.25, 1.55, 5.5, 4.05, 'Screenshot: live ClusterCart run recommending separate trips')
  box(s, 7.25, 5.72, 5.5, 0.95, FOREST, { r: 0.12 })
  txt(s, [{ text: 'We ran it live and it said NO. ', options: { bold: true, color: GOLD } }, { text: 'Sharing the truck would cost 18.7% more, so it recommended separate trips and explained why.', options: { color: WHITE } }], 7.45, 5.77, 5.15, 0.85, { fontSize: 13.5, valign: 'middle' })
  foot(s, 'Rule-based and explainable, not AI. Transport costs are estimates (straight-line distance × road factor, standard rates), not carrier quotes. Each farmer still accepts his own offer. Live run on demo data.')
}

// ---------------------------------------------------------------- 6 NETBACK
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'NetBack · the real money')
  title(s, 'A higher offer isn’t always a better deal')
  txt(s, 'Example: what Dhruv really keeps', 0.6, 1.4, 6, 0.35, { fontSize: 13, bold: true, color: GOLD_INK })
  const base = 6.0, k = 3.6 / 2500
  const bars = [['Offer', 2500, 0, FOREST, '₹2,500'], ['Transport he pays', 200, 2300, RED, '− ₹200'], ['Packing he pays', 50, 2250, RED, '− ₹50'], ['Dhruv keeps', 2250, 0, GOLD, '₹2,250']]
  bars.forEach(([l, v, from, c, lab], i) => {
    const x = 0.8 + i * 1.6, h = Math.max(v * k, 0.12), y = base - (from + v) * k
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 1.15, h, fill: { color: c }, line: { color: c } })
    txt(s, lab, x - 0.2, y - 0.45, 1.55, 0.4, { fontSize: 16, bold: true, align: 'center', color: c === GOLD ? GOLD_INK : c })
    txt(s, l, x - 0.25, base + 0.08, 1.65, 0.6, { fontSize: 12, align: 'center', color: INK, bold: i === 3 })
  })
  s.addShape(pres.shapes.LINE, { x: 0.6, y: base, w: 6.4, h: 0, line: { color: MUTED, width: 1 } })
  box(s, 7.3, 1.45, 2.75, 2.2, CREAM, { r: 0.14 })
  txt(s, 'The hostel sees its own number', 7.5, 1.6, 2.4, 0.65, { fontSize: 14, bold: true, color: FOREST })
  txt(s, 'Total cost to get the food to its kitchen (landed cost), shown separately.', 7.5, 2.3, 2.4, 1.25, { fontSize: 13, color: INK })
  box(s, 7.3, 3.85, 2.75, 2.15, FOREST, { r: 0.14 })
  txt(s, 'Plus a dated mandi price nearby, so Dhruv knows if the offer is fair.', 7.5, 4.0, 2.4, 1.9, { fontSize: 14, color: WHITE, bold: true })
  pic(s, IMG('netback_live.jpg'), 10.3, 1.45, 2.45, 2.69, 'Screenshot: live NetBack panel on a tomato listing')
  txt(s, 'Live app: 300 kg at ₹22/kg → farmer keeps ₹6,300, buyer pays ₹6,600 (demo data, estimated costs)', 10.3, 4.2, 2.45, 1.4, { fontSize: 10.5, color: MUTED })
  foot(s, 'Example numbers. Clearer offers and less wasted cost can help farmers earn more and buyers pay fairly; shop prices are not guaranteed to fall. All money is calculated in exact paise.')
}

// ---------------------------------------------------------------- 7 BUSINESS ON HIS PHONE
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'More than a marketplace')
  title(s, 'Dhruv’s shop, order book and customer diary')
  pic(s, IMG('dashboard.jpg'), 0.6, 1.5, 6.6, 4.92, 'Screenshot: live Farmer Command Centre for the demo farmer Dhruv')
  const groups = [
    ['Safe deals', 'Stock is reserved instantly, so no one buys the same crates twice. Track pickup → on the way → delivered.'],
    ['Customers who come back', 'My Clients: enquiry → active → repeat client, with favourites and private notes. Buyers get My Suppliers.'],
    ['A clear morning dashboard', 'Open listings, offers waiting, orders on the way, money from completed sales.'],
    ['Help beyond selling', 'Seed store with honest badges, dated mandi prices, government schemes, land listings.'],
  ]
  groups.forEach(([h, d], i) => {
    const y = 1.5 + i * 1.25
    box(s, 7.5, y, 5.25, 1.1, i % 2 ? CREAM : MINT, { r: 0.12 })
    txt(s, h, 7.7, y + 0.1, 4.9, 0.4, { fontSize: 16, bold: true, color: FOREST })
    txt(s, d, 7.7, y + 0.5, 4.9, 0.6, { fontSize: 12.5, color: INK })
  })
  foot(s, 'All shown modules work in the live app and are covered by automated tests. Screenshot: demo farmer account (synthetic data).')
}

// ---------------------------------------------------------------- 8 EVERY FARMER
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'Made for every farmer')
  title(s, 'Dhruv’s language. Dhruv’s phone')
  const langs = ['English', 'हिन्दी', 'বাংলা', 'తెలుగు', 'मराठी', 'தமிழ்', 'ગુજરાતી', 'ಕನ್ನಡ', 'മലയാളം', 'ਪੰਜਾਬੀ']
  langs.forEach((l, i) => { const x = 0.6 + (i % 5) * 1.32, y = 1.5 + Math.floor(i / 5) * 0.68; box(s, x, y, 1.2, 0.55, i === 1 ? FOREST : MINT, { r: 0.25 }); txt(s, l, x, y, 1.2, 0.55, { fontSize: 15, bold: true, align: 'center', valign: 'middle', color: i === 1 ? WHITE : FOREST }) })
  txt(s, '“किसान अपनी भाषा में, अपने फ़ोन पर, अपना सही दाम देख सकता है।”', 0.6, 2.95, 6.6, 0.5, { fontSize: 15, italic: true, bold: true, color: GOLD_INK })
  txt(s, 'Ten languages live today, crop names too. Native-speaker review in progress.', 0.6, 3.45, 6.6, 0.4, { fontSize: 12, color: MUTED })
  const pts = ['Big buttons and short steps', 'Clear kilos and quintals', 'Works on an ordinary smartphone, even on slow internet', 'Friendly guide: Dhruv shows new farmers how to list', 'Help at first through local farmer groups and cooperatives']
  s.addText(pts.map((p, i) => ({ text: p, options: { bullet: true, breakLine: i < pts.length - 1 } })), { x: 0.6, y: 3.95, w: 5.4, h: 2.3, fontSize: 15, color: INK, paraSpaceAfter: 6, margin: 0, isTextBox: true, valign: 'top' })
  pic(s, IMG('dhruv_avatar.png'), 6.0, 4.6, 1.2, 1.2, 'Dhruv, the guide character')
  box(s, 0.6, 6.25, 6.6, 0.55, CREAM, { r: 0.1 })
  txt(s, '98% of Indian internet users already use Indian-language content.', 0.8, 6.25, 6.3, 0.55, { fontSize: 13, valign: 'middle', color: FOREST, bold: true })
  pic(s, IMG('m_bn.jpg'), 7.7, 1.4, 2.35, 5.08, 'Screenshot: SEED X home page in Bengali on a phone')
  pic(s, IMG('m_ta.jpg'), 10.35, 1.4, 2.35, 5.08, 'Screenshot: SEED X marketplace in Tamil on a phone')
  foot(s, 'Source: IAMAI–Kantar "Internet in India 2024": 870 million users (98%) accessed Indic-language content in 2024; all internet users, not a farmer survey. Screens: Bengali and Tamil, live app. We will test core tasks with farmers in the pilot.')
}

// ---------------------------------------------------------------- 9 TRUST
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'Can I trust it?')
  title(s, 'Like a bank: everyone has their own locker')
  const ctrls = [
    ['Your own locker', 'Dhruv can’t open the hostel’s data, and the hostel can’t open his.'],
    ['Address stays hidden', 'His exact farm unlocks only for the buyer and driver, after a real order.'],
    ['Only verified traders', 'Everyone confirms their email before they can buy or sell.'],
    ['Extra lock for admins', 'Admins need a second code from their phone for anything sensitive.'],
  ]
  ctrls.forEach(([h, d], i) => {
    const x = 0.6 + (i % 2) * 3.55, y = 1.55 + Math.floor(i / 2) * 2.3
    box(s, x, y, 3.35, 2.05, i % 3 === 0 ? MINT : CREAM, { r: 0.12 })
    txt(s, h, x + 0.22, y + 0.2, 2.95, 0.5, { fontSize: 18, bold: true, color: FOREST })
    txt(s, d, x + 0.22, y + 0.8, 2.95, 1.15, { fontSize: 14, color: INK })
  })
  box(s, 7.95, 1.55, 4.8, 4.35, '0B1F17', { r: 0.12 })
  txt(s, 'We attacked our own app 141 ways', 8.2, 1.7, 4.3, 0.45, { fontSize: 16, bold: true, color: GOLD })
  const lines = [
    ['Another farmer reads Dhruv’s private notes', 'BLOCKED'],
    ['Two buyers grab the last crate at once', 'ONE WINS'],
    ['Same order sent twice', 'NO DOUBLE'],
    ['Normal user tries an admin action', 'BLOCKED'],
    ['Upload into someone else’s folder', 'BLOCKED'],
  ]
  lines.forEach(([l, r], i) => {
    const y = 2.3 + i * 0.6
    txt(s, '✓', 8.2, y, 0.3, 0.45, { fontSize: 14, bold: true, color: '7BD69B' })
    txt(s, l, 8.55, y, 2.85, 0.55, { fontSize: 12.5, color: 'E6F1E7' })
    txt(s, r, 11.3, y, 1.3, 0.45, { fontSize: 12.5, bold: true, color: GOLD, align: 'right' })
  })
  txt(s, 'Every test passed: 141 / 141', 8.2, 5.35, 4.3, 0.4, { fontSize: 14, bold: true, color: WHITE })
  txt(s, 'We won’t call it unhackable. We show exactly what we tested.', 0.6, 6.25, 12, 0.45, { fontSize: 15, italic: true, bold: true, color: FOREST })
  foot(s, 'From the project’s automated security tests (database + browser), run against the live system on 31 Oct 2026.')
}

// ---------------------------------------------------------------- 10 HIGHWAY / ROAD
{
  const s = pres.addSlide({ masterName: 'LIGHT' })
  kicker(s, 'Why SEED X is different')
  title(s, 'They built the highway. We build Dhruv’s road')
  box(s, 0.6, 1.6, 4.6, 3.3, CREAM, { r: 0.14 })
  txt(s, 'THE HIGHWAY · already exists', 0.85, 1.75, 4.2, 0.4, { fontSize: 12, bold: true, color: GOLD_INK, charSpacing: 1 })
  txt(s, 'e-NAM', 0.85, 2.2, 4.1, 0.45, { fontSize: 20, bold: true, color: FOREST })
  txt(s, 'Online trading between mandis, with price discovery and auctions.', 0.85, 2.65, 4.1, 0.8, { fontSize: 13.5 })
  txt(s, 'AGMARKNET', 0.85, 3.45, 4.1, 0.45, { fontSize: 20, bold: true, color: FOREST })
  txt(s, 'Daily mandi prices for the whole country.', 0.85, 3.9, 4.1, 0.6, { fontSize: 13.5 })
  arrow(s, 5.3, 3.25, 0.55, GOLD_INK)
  box(s, 6.0, 1.6, 6.75, 3.3, FOREST, { r: 0.14 })
  txt(s, 'THE ROAD · SEED X', 6.25, 1.75, 6, 0.4, { fontSize: 12, bold: true, color: GOLD, charSpacing: 1 })
  const f = ['Dhruv’s own crops and stock', 'Nearby direct buyers: hostels, restaurants, shops', 'Shared trucks only when cheaper', 'His real take-home money', 'Regular customers who come back', 'Uses public mandi prices as a reference']
  s.addText(f.map((p, i) => ({ text: p, options: { bullet: true, breakLine: i < f.length - 1 } })), { x: 6.25, y: 2.2, w: 6.3, h: 2.6, fontSize: 15, color: WHITE, paraSpaceAfter: 4, margin: 0, isTextBox: true, valign: 'top' })
  txt(s, 'Not a mock-up: it’s live', 0.6, 5.15, 6, 0.4, { fontSize: 15, bold: true, color: MUTED })
  const tech = [['Modern web app', 'Fast on any phone'], ['Secure cloud database', 'Locked per user'], ['Hosted on Cloudflare', 'Worldwide, auto-updates'], ['Live today', 'Scan the QR and try it']]
  tech.forEach(([h, d], i) => { const x = 0.6 + i * 3.06; box(s, x, 5.6, 2.9, 1.05, MINT, { r: 0.12 }); txt(s, h, x + 0.2, 5.68, 2.55, 0.4, { fontSize: 14.5, bold: true, color: FOREST }); txt(s, d, x + 0.2, 6.1, 2.55, 0.45, { fontSize: 12.5 }) })
  foot(s, 'Sources: enam.gov.in; data.gov.in / AGMARKNET daily mandi prices. SEED X complements public market systems; it does not claim to be the first digital mandi. Entirely software-based.')
}

// ---------------------------------------------------------------- 11 DEMO + BUSINESS + CLOSE
{
  const s = pres.addSlide({ masterName: 'DARK' })
  kicker(s, 'See it live · the plan', GOLD)
  title(s, 'See it live, in 60 seconds', { color: WHITE })
  const demo = ['Home page: a farmer’s world', 'Dhruv’s tomato listing', 'NetBack: what he really keeps', 'ClusterCart: share the truck or not?', 'My Suppliers & morning dashboard', 'Switch to हिन्दी']
  demo.forEach((d, i) => { const y = 1.45 + i * 0.52; txt(s, String(i + 1), 0.6, y, 0.4, 0.45, { fontSize: 18, bold: true, color: GOLD }); txt(s, d, 1.05, y + 0.04, 3.95, 0.45, { fontSize: 14, color: WHITE }) })
  box(s, 0.6, 4.75, 1.35, 1.35, WHITE, { r: 0.08 })
  pic(s, A('seedx_qr_verified.png'), 0.67, 4.82, 1.21, 1.21, 'QR code to the live SEED X site')
  txt(s, [{ text: 'Live: ', options: { bold: true, color: GOLD } }, { text: 'seedxsss.tejash-shastri-rx.workers.dev', options: { color: WHITE, hyperlink: { url: 'https://seedxsss.tejash-shastri-rx.workers.dev/' } } }, { text: '\nBackup video ready (79 s)', options: { color: CREAM } }], 2.1, 4.85, 3.1, 1.2, { fontSize: 12 })
  box(s, 5.45, 1.4, 3.6, 4.7, GOLD, { r: 0.14 })
  txt(s, 'How SEED X earns', 5.65, 1.55, 3.2, 0.4, { fontSize: 15, bold: true, color: DEEP })
  const b = [['Farmers list free. Always.', ''], ['Small fee on completed orders', 'paid by buyers'], ['ClusterCart planning', 'for hostels, canteens, retailers'], ['Start small', 'one district · one crop · one farmer group']]
  b.forEach(([h, d], i) => { const y = 2.05 + i * 0.92; txt(s, h, 5.65, y, 3.25, 0.45, { fontSize: 14, bold: true, color: DEEP }); if (d) txt(s, d, 5.65, y + 0.42, 3.25, 0.45, { fontSize: 12, color: '3A2A08' }) })
  txt(s, 'Proposed, to be tested in the pilot', 5.65, 5.7, 3.2, 0.35, { fontSize: 10.5, italic: true, color: '3A2A08' })
  box(s, 9.3, 1.4, 3.45, 4.7, '173A2C', { r: 0.14 })
  txt(s, 'What we’ll measure', 9.5, 1.55, 3.1, 0.4, { fontSize: 15, bold: true, color: GOLD })
  const m = ['More money per kilo for the farmer', 'Lower cost per kilo for buyers', 'Transport cost per kilo', 'Time to find a buyer', 'On-time deliveries', 'Buyers who come back', 'Less crop wasted']
  s.addText(m.map((p, i) => ({ text: p, options: { bullet: true, breakLine: i < m.length - 1 } })), { x: 9.5, y: 2.05, w: 3.1, h: 3.95, fontSize: 13, color: WHITE, paraSpaceAfter: 5, margin: 0, isTextBox: true, valign: 'top' })
  txt(s, 'Today, of your ₹40, maybe ₹13 reaches Dhruv. He doesn’t need sympathy. He needs to see his buyers, his costs and his real price.', 0.6, 6.25, 12.15, 0.75, { fontSize: 16, bold: true, italic: true, color: GOLD })
  txt(s, 'SEED X · Created & Developed by Tejash Shastri and Shaurya', 0.6, 7.02, 8, 0.32, { fontSize: 11, color: CREAM })
}

;(async () => {
  await pres.writeFile({ fileName: OUT })
  await applyTheme(OUT, THEME)
  console.log('wrote', OUT)
})()
