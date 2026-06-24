import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// CF6: the Settings → Account page must populate the Display-name + Email inputs
// with the authed session user's values. Before the fix the page was a *non*-async
// component that never called requireUser() and the inputs had no defaultValue, so
// they rendered empty even when logged in. This probe renders the real page server
// component (requireUser + client theme island mocked) and asserts the inputs
// carry the user's name/email via the emitted `value="…"` attribute.
//
// RED (pre-fix): no value attributes → these assertions fail (inputs empty).
// GREEN (post-fix): value="Ada Lovelace" / value="ada@parchment.local" present.

// page.tsx → @/lib/auth/guard imports 'server-only'; neutralize it for the runner.
vi.mock('server-only', () => ({}))

const SESSION_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'ada@parchment.local',
  name: 'Ada Lovelace',
  passwordHash: null,
  role: 'owner',
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

// Stand in for the live session user; the (app) layout already redirects when null.
vi.mock('@/lib/auth/guard', () => ({
  requireUser: vi.fn(async () => SESSION_USER),
}))

// The Theme section is a client island ('use client' + next/navigation). It is
// irrelevant to the Profile inputs under test, so replace it with a stub to keep
// the render pure in the node test environment.
vi.mock('@/components/settings/AccountThemeSelect', () => ({
  AccountThemeSelect: () => null,
}))

async function renderAccountPage(): Promise<string> {
  const { default: AccountSettingsPage } = await import('@/app/(app)/settings/account/page')
  // It is an async server component → await the element tree, then render to HTML.
  const element = await AccountSettingsPage()
  return renderToStaticMarkup(element)
}

describe('CF6 — Settings → Account profile inputs', () => {
  it('renders the Display-name input pre-filled with the session user name', async () => {
    const html = await renderAccountPage()
    expect(html).toContain('id="account-name"')
    expect(html).toContain(`value="${SESSION_USER.name}"`)
  })

  it('renders the Email input pre-filled with the session user email', async () => {
    const html = await renderAccountPage()
    expect(html).toContain('id="account-email"')
    expect(html).toContain(`value="${SESSION_USER.email}"`)
  })

  it('resolves the authed user via requireUser (not hardcoded/empty)', async () => {
    const guard = await import('@/lib/auth/guard')
    const html = await renderAccountPage()
    expect(guard.requireUser).toHaveBeenCalled()
    // The Profile inputs are non-empty — the CF6 bug was empty fields.
    expect(html).not.toContain('id="account-name" type="text" autocomplete="name"/>')
    expect(html).toContain('ada@parchment.local')
  })
})
