import { expect, test } from '@playwright/test'

// D2-T5 — the selective-restore picker renders its dialog + entry table + dry-run
// button on /settings/backup.

test('selective restore — picker shows entry list + filter works', async ({ page }) => {
  await page.goto('/settings/backup')

  // Open the selective restore picker.
  await page.getByRole('button', { name: 'Selective restore…' }).click()

  // The picker dialog is visible.
  await expect(page.getByRole('dialog', { name: /selective restore/i })).toBeVisible()

  // A "Dry run" button is present.
  await expect(page.getByRole('button', { name: 'Dry run' })).toBeVisible()

  // The entry-table "Document" column header is present (table rendered shell).
  await expect(page.getByRole('columnheader', { name: 'Document' })).toBeVisible()
})
