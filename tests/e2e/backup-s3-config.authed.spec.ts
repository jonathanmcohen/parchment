import { expect, test } from '@playwright/test'

// F1-T9 — the S3 config form on /settings/backup renders and submits. Uses the
// seeded owner (admin) session via storageState.

test('S3 config form — admin can open, fill, save, see masked key', async ({ page }) => {
  await page.goto('/settings/backup')
  await expect(page.getByRole('heading', { name: 'S3 backup' })).toBeVisible()

  // The form fields exist.
  await expect(page.getByLabel('Endpoint')).toBeVisible()
  await expect(page.getByLabel('Bucket')).toBeVisible()

  // Fill and submit.
  await page.getByLabel('Endpoint').fill('https://minio.local:9000')
  await page.getByLabel('Bucket').fill('parchment')
  await page.getByLabel('Access key ID').fill('AKIA')
  await page.getByLabel('Secret access key').fill('shh')
  await page.getByRole('button', { name: 'Save' }).click()

  // After save the secret is stored → the field shows the mask.
  await expect(page.getByLabel('Secret access key')).toHaveValue('***')
})
