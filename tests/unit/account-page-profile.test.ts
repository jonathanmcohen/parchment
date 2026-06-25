import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// CF6: the Settings → Account page must populate the Display-name + Email inputs
// with the authed session user's values. Before CF6 the page never called
// requireUser() and the inputs had no value, so they rendered empty.
//
// V2 update: Display name is now the AccountNameSetting client island (it takes
// the value as the `initialName` prop and persists edits) and Language is the
// LocaleSwitcher island; both are 'use client' + next/navigation, so — like the
// existing AccountThemeSelect mock — they are stubbed to keep this SSR probe pure.
// The AccountNameSetting stub echoes its `initialName` so the page→island
// name-wiring is still asserted. Email stays a server-rendered (now read-only)
// input.
//
// RED (pre-CF6): no value attributes → assertions fail (inputs empty).
// GREEN: value="Ada Lovelace" passed to the name island / value="ada@parchment.local".

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

// V2: Display name moved into the AccountNameSetting client island (useRouter →
// throws without a mounted app router in this SSR probe). Stub it to echo the
// `initialName` prop as an input value, so the page→island wiring is still
// asserted while keeping the render pure.
vi.mock('@/components/settings/AccountNameSetting', () => ({
  AccountNameSetting: ({ initialName }: { initialName: string }) =>
    createElement('input', { id: 'account-name', value: initialName, readOnly: true }),
}))

// V2: Language is the LocaleSwitcher island (useRouter/useLocale) — irrelevant to
// the Profile inputs under test; stub to null like AccountThemeSelect.
vi.mock('@/components/i18n/LocaleSwitcher', () => ({
  LocaleSwitcher: () => null,
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
