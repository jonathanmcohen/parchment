import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// K4 — every top-level route is an axe-core target. Zero violations or the
// release tag job fails.
const routes = ['/', '/files', '/templates', '/inbox', '/trash', '/settings']

for (const route of routes) {
  test(`a11y: ${route} has zero WCAG 2 A/AA violations`, async ({ page }) => {
    await page.goto(route)
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()

    // Surface a readable summary on failure.
    expect(
      violations,
      violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n'),
    ).toEqual([])
  })
}
