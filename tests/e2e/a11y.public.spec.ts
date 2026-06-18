import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// K4 — public routes (no session). The landing page and the login form.
test.use({ storageState: { cookies: [], origins: [] } })

const routes = ['/', '/login']

for (const route of routes) {
  test(`a11y (public): ${route} has zero WCAG 2 A/AA violations`, async ({ page }) => {
    await page.goto(route)
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(
      violations,
      violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n'),
    ).toEqual([])
  })
}
