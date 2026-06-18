import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// K4 — authed (app) routes. Uses the seeded session cookie from storageState.
const routes = [
  '/files',
  '/templates',
  '/inbox',
  '/trash',
  '/settings/account',
  '/settings/workspace',
  '/settings/admin',
  '/settings/developer',
  '/settings/notifications',
  '/settings/security',
  '/settings/admin/audit',
  '/settings/admin/health',
]

for (const route of routes) {
  test(`a11y (authed): ${route} has zero WCAG 2 A/AA violations`, async ({ page }) => {
    await page.goto(route)
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(
      violations,
      violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n'),
    ).toEqual([])
  })
}
