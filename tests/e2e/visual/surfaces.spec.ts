import { expect, test } from '@playwright/test'
import { SEEDED_DOC_ID } from '../global-setup'

// S1-0 — visual-regression baselines for the 7 main surfaces (README "Verification
// gate"). The controller runs this suite per-PR to capture RED (pre-change) and
// GREEN (post-change) artifacts for every S1–S5 item. Baselines are per-platform.
//
// A few target states are not built yet — the `/` → `/files` redirect is S5-6 and
// the toolbar overflow (⋯) is S3-3 — so those surfaces capture the CURRENT state;
// the baseline is updated (reviewed diff) in the PR that changes the surface.

const editor = `/d/${SEEDED_DOC_ID}`

async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
  // collapse the offline pill / async chrome so the shot is stable
  await page.waitForTimeout(1200)
}

test.describe('v0.1.1 surfaces', () => {
  test('01 — landing (/, redirect target = S5-6)', async ({ page }) => {
    await page.goto('/')
    await settle(page)
    await expect(page).toHaveScreenshot('01-landing.png', { fullPage: true })
  })

  test('02 — files page', async ({ page }) => {
    await page.goto('/files')
    await settle(page)
    await expect(page).toHaveScreenshot('02-files.png', { fullPage: true })
  })

  test('03 — file list region', async ({ page }) => {
    await page.goto('/files')
    await settle(page)
    await expect(page.locator('main').first()).toHaveScreenshot('03-file-list.png')
  })

  test('04 — doc editor idle', async ({ page }) => {
    await page.goto(editor)
    await settle(page)
    await expect(page).toHaveScreenshot('04-editor-idle.png', { fullPage: true })
  })

  test('05 — editor toolbar (overflow ⋯ = S3-3)', async ({ page }) => {
    await page.goto(editor)
    await settle(page)
    await expect(page.locator('[role="toolbar"][aria-label="Formatting"]')).toHaveScreenshot(
      '05-editor-toolbar.png',
    )
  })

  test('06 — share dialog open', async ({ page }) => {
    await page.goto(editor)
    await settle(page)
    await page.getByRole('button', { name: 'Share' }).first().click()
    await expect(page.locator('.parchment-dialog')).toBeVisible()
    await page.waitForTimeout(400)
    await expect(page.locator('.parchment-dialog')).toHaveScreenshot('06-share-dialog.png')
  })

  test('07 — settings → theme', async ({ page }) => {
    await page.goto('/settings/workspace')
    await settle(page)
    await expect(page).toHaveScreenshot('07-settings-theme.png', { fullPage: true })
  })
})
