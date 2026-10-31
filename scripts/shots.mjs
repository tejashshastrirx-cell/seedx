// Quick visual QA: screenshots + console errors for a list of routes at phone and desktop widths.
import { chromium } from 'playwright';
const base = process.env.BASE ?? 'http://localhost:4173';
const routes = (process.env.ROUTES ?? '/,/marketplace,/prices,/seeds,/schemes,/about,/how-it-works,/login,/signup').split(',');
const sizes = (process.env.SIZES ?? '390x844,1280x900').split(',').map((s) => s.split('x').map(Number));
const browser = await chromium.launch();
const errors = [];
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${w} ${page.url()} ${m.text().slice(0, 200)}`) });
  page.on('pageerror', (e) => errors.push(`${w} ${page.url()} PAGEERROR ${e.message.slice(0, 200)}`));
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: 'networkidle' }).catch((e) => errors.push(`${r} nav ${e.message}`));
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) errors.push(`${w} ${r} HORIZONTAL OVERFLOW`);
    await page.screenshot({ path: `qa/${w}${r.replace(/[/?=&]/g, '_') || '_home'}.png`, fullPage: process.env.FULL === '1' });
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no console errors / overflow');
