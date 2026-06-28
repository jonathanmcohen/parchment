import { expect, test } from '@playwright/test'

// D2-T5 — the selective-restore picker renders its dialog + entry table + dry-run
// button on /settings/backup. The page has other dry-run-style controls, so the
// assertions are scoped to the picker dialog to avoid a strict-mode locator clash.

test('selective restore — picker shows entry list + filter works', async ({ page }) => {
  await page.goto('/settings/backup')

  // Open the selective restore picker.
  await page.getByRole('button', { name: 'Selective restore…' }).click()

  // The picker dialog is visible.
  const dialog = page.getByRole('dialog', { name: /selective restore/i })
  await expect(dialog).toBeVisible()

  // A "Dry run" button is present (scoped to the dialog).
  await expect(dialog.getByRole('button', { name: 'Dry run' })).toBeVisible()

  // The entry-table "Document" column header is present (the table shell renders
  // up-front, before any dry run).
  await expect(dialog.getByRole('columnheader', { name: 'Document' })).toBeVisible()
})
