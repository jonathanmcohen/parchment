import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// K4 — public routes (no session). The landing page and the login form.
test.use({ storageState: { cookies: [], origins: [] } })

// /setup redirects to /login once an owner exists (global-setup seeds one), so it
// resolves to the login form — still a valid public a11y target. The share route
// uses a deliberately invalid token, which renders the stable "Link expired or
// invalid" public view (no session, no seeded share required).
const routes = ['/', '/login', '/setup', '/share/this-token-does-not-exist']

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
