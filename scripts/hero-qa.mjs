// Hero QA: viewports, weather modes (animation loop state), reduced motion, overflow, console errors.
import { chromium } from 'playwright';
const base = 'http://localhost:4173/';
const browser = await chromium.launch();
const issues = [];
const anim = (p) => p.locator('canvas[data-weather]').getAttribute('data-animating');
for (const [w, h] of [[360, 780], [375, 812], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', (m) => { if (m.type() === 'error') issues.push(`${w}: ${m.text().slice(0, 140)}`) });
  page.on('pageerror', (e) => issues.push(`${w}: PAGEERROR ${e.message.slice(0, 140)}`));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) issues.push(`${w}: horizontal overflow`);
  const cta = await page.getByRole('link', { name: 'I am a farmer' }).boundingBox();
  if (!cta || cta.y + cta.height > h) issues.push(`${w}: primary CTA not in first viewport`);
  await page.screenshot({ path: `qa/hero-${w}-auto.png` });
  if (w === 1440 || w === 390) {
    for (const m of ['Clear', 'Dust', 'Rain']) {
      await page.evaluate(() => window.scrollTo(0, 0)); await page.getByRole('radio', { name: m }).click();
      await page.waitForTimeout(1500);
      const a = await anim(page);
      if ((m === 'Clear') !== (a === 'false')) issues.push(`${w}: mode ${m} animating=${a}`);
      await page.screenshot({ path: `qa/hero-${w}-${m.toLowerCase()}.png` });
    }
  }
  await page.close();
}
const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await rm.goto(base, { waitUntil: 'networkidle' }); await rm.waitForTimeout(1000);
if ((await anim(rm)) !== 'false') issues.push('reduced motion: canvas still animating');
await browser.close();
console.log(issues.length ? issues.join('\n') : 'hero QA: all checks passed');
