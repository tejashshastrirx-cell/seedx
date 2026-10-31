// Load key routes with the production CSP injected on the document and report any violations / errors.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const csp = readFileSync('public/_headers', 'utf8').match(/Content-Security-Policy: (.*)/)[1];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 180)) });
page.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message.slice(0, 180)));
await page.route('**/*', async (route) => {
  if (route.request().resourceType() !== 'document') return route.continue();
  const res = await route.fetch();
  await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } });
});
for (const r of ['/', '/marketplace', '/prices', '/seeds', '/schemes', '/login']) {
  await page.goto('http://localhost:4173' + r, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(r === '/' ? 9000 : 2500);
}
await browser.close();
console.log(problems.length ? [...new Set(problems)].join('\n') : 'CSP: no violations or console errors');
