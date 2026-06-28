import { expect, test } from '@playwright/test'

// F1-T9 — the S3 config form on /settings/backup renders and submits. Uses the
// seeded owner (admin) session via storageState. The page has several "Save"
// buttons (S3 + git-sync), so the Save click is scoped to the S3 form (the one
// containing the Endpoint field) to avoid a strict-mode locator clash.

// Mirrors SECRET_MASK (src/lib/crypto/mask.ts) — the value the field shows once a
// secret is stored.
const MASK = '••••••••'

test('S3 config form — admin can open, fill, save, see masked key', async ({ page }) => {
  await page.goto('/settings/backup')
  await expect(page.getByRole('heading', { name: 'S3 backup' })).toBeVisible()

  // The form fields exist.
  await expect(page.getByLabel('Endpoint')).toBeVisible()
  await expect(page.getByLabel('Bucket')).toBeVisible()

  // The S3 form is the <form> that contains the Endpoint field.
  const s3Form = page.locator('form').filter({ has: page.getByLabel('Endpoint') })

  // Fill and submit.
  await page.getByLabel('Endpoint').fill('https://minio.local:9000')
  await page.getByLabel('Bucket').fill('parchment')
  await page.getByLabel('Access key ID').fill('AKIA')
  await page.getByLabel('Secret access key').fill('shh')
  await s3Form.getByRole('button', { name: 'Save' }).click()

  // After save the secret is stored → the field shows the canonical mask.
  await expect(page.getByLabel('Secret access key')).toHaveValue(MASK)
})
