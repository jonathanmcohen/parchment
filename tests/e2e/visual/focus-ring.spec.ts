import { expect, test } from '@playwright/test'
import { SEEDED_DOC_ID } from '../global-setup'

// S1-6 — every focusable control shows a visible 2px `--primary` focus ring
// (#1A73E8 light / #8AB4F8 dark) at outline-offset 2px. This spec tabs through
// the chrome + editor on surfaces #2 (files), #4 (editor), #6 (share dialog),
// #7 (settings→theme) in BOTH schemes and asserts the ring on each focused
// control. A control that overrides the ring away is a real S1-6 violation.

const BLUE = {
  light: 'rgb(26, 115, 232)', // #1A73E8
  dark: 'rgb(138, 180, 248)', // #8AB4F8
} as const

type Scheme = keyof typeof BLUE

const SURFACES: { name: string; path: string; settleMs: number }[] = [
  { name: 'files', path: '/files', settleMs: 1000 },
  { name: 'editor', path: `/d/${SEEDED_DOC_ID}`, settleMs: 1500 },
  { name: 'settings-theme', path: '/settings/workspace', settleMs: 1000 },
]

// Read the computed focus outline of document.activeElement.
async function focusedOutline(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return null
    const s = getComputedStyle(el)
    const r = (el as HTMLElement).getBoundingClientRect()
    return {
      tag: el.tagName.toLowerCase(),
      label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 24) || '',
      width: Number.parseFloat(s.outlineWidth),
      style: s.outlineStyle,
      color: s.outlineColor,
      offset: s.outlineOffset,
      visible: r.width > 0 && r.height > 0,
    }
  })
}

function assertRing(o: NonNullable<Awaited<ReturnType<typeof focusedOutline>>>, scheme: Scheme) {
  // 2px (allow sub-pixel rounding), solid, --primary blue, offset 2px.
  expect(o.style, `${o.tag}[${o.label}] outline-style`).toBe('solid')
  expect(o.width, `${o.tag}[${o.label}] outline-width`).toBeGreaterThanOrEqual(1.5)
  expect(o.color, `${o.tag}[${o.label}] outline-color (${scheme})`).toBe(BLUE[scheme])
  expect(o.offset, `${o.tag}[${o.label}] outline-offset`).toBe('2px')
}

for (const scheme of ['light', 'dark'] as Scheme[]) {
  for (const surface of SURFACES) {
    test(`focus ring — ${surface.name} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(surface.path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(surface.settleMs)

      let checked = 0
      // Tab through 18 stops; assert the ring on each visible focusable. (No
      // dedup-break — empty-label controls would collide; a repeat just re-asserts.)
      for (let i = 0; i < 18; i++) {
        await page.keyboard.press('Tab')
        const o = await focusedOutline(page)
        if (!o?.visible) continue
        assertRing(o, scheme)
        checked++
      }
      expect(checked, `tabbed past ≥3 focusables on ${surface.name}`).toBeGreaterThanOrEqual(3)
    })
  }
}

// Surface #6 — the share dialog (a focus-trapped modal): its controls must also
// carry the ring, in both schemes.
for (const scheme of ['light', 'dark'] as Scheme[]) {
  test(`focus ring — share dialog (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(`/d/${SEEDED_DOC_ID}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: 'Share' }).first().click()
    await expect(page.locator('.parchment-dialog')).toBeVisible()
    let checked = 0
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      const o = await focusedOutline(page)
      if (!o?.visible) continue
      assertRing(o, scheme)
      checked++
      if (checked >= 4) break
    }
    expect(checked).toBeGreaterThanOrEqual(2)
  })
}
