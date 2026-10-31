import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { pinLanguage } from './helpers'

// WCAG 2.1 A/AA automated checks on public routes, in English and two Indic scripts.
const routes = ['/', '/marketplace', '/prices', '/seeds', '/schemes', '/login', '/signup', '/how-it-works', '/help']
for (const lang of ['en', 'hi', 'ta']) {
  test(`axe: no serious or critical violations (${lang})`, async ({ page }) => {
    await pinLanguage(page, lang)
    const found: string[] = []
    for (const r of lang === 'en' ? routes : routes.slice(0, 3)) {
      await page.goto(r)
      await page.waitForLoadState('networkidle')
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('canvas').analyze()
      for (const v of res.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
        found.push(`${r} ${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)
      }
    }
    expect(found).toEqual([])
  })
}
