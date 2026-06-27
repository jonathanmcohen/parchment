import { expect, test } from '@playwright/test'

// A4 Task 12: DOM-probe verification of the per-user document ACL panel mounted in
// the editor's Share dialog. We don't submit a grant against a second real user
// here (that path is covered by integration Task 7); we assert the panel renders
// with a role select inside the Share dialog.

test('doc owner can open the people-ACL panel from the Share dialog', async ({ page }) => {
  // open the seeded doc the owner owns, then open Share
  await page.goto('/d/00000000-0000-0000-0000-0000000000d0')
  await page.getByRole('button', { name: /share/i }).first().click()
  // the people-ACL panel is present inside the share dialog
  const panel = page.getByTestId('doc-permissions-panel')
  await expect(panel).toBeVisible()
  // a role select for the people picker exists
  await expect(panel.getByLabel(/role/i).first()).toBeVisible()
})
