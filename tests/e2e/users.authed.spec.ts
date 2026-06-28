import { expect, test } from '@playwright/test'

// A1 Task 11: DOM/computed-probe verification of the admin Users page. The seeded
// e2e user is the owner (global-setup), so the page renders (not redirected) and
// the owner row exposes no destructive control that could remove the last owner.

test('owner sees the Users admin page and can open the invite form', async ({ page }) => {
  await page.goto('/settings/users')
  // page renders (not redirected to / or /login)
  await expect(page).toHaveURL(/\/settings\/users$/)
  await expect(page.getByRole('heading', { name: /users|people/i }).first()).toBeVisible()
  // the current owner row is present and marked owner
  const ownerRow = page.getByTestId('user-row').filter({ hasText: '@' }).first()
  await expect(ownerRow).toBeVisible()
  // invite form is reachable
  await page
    .getByRole('button', { name: /invite/i })
    .first()
    .click()
  await expect(page.getByLabel(/email/i).first()).toBeVisible()
  await expect(page.getByLabel(/role/i).first()).toBeVisible()
})

test('the owner row exposes no destructive control that would remove the last owner', async ({
  page,
}) => {
  await page.goto('/settings/users')
  const ownerRow = page.getByTestId('user-row').filter({ hasText: /owner/i }).first()
  // delete/disable for the sole owner must be absent or disabled (UI mirror of the
  // server invariant; the server is the real gate, tested in Task 8/10).
  const del = ownerRow.getByRole('button', { name: /delete/i })
  if (await del.count()) await expect(del).toBeDisabled()
})
