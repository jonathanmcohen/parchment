// Task 3.5 — the login "Sign in with SSO" button renders IFF ssoEnabled is true and
// links to /api/auth/sso/start. Rendered statically (no DB, no client config leak).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LoginForm } from '@/app/(auth)/login/login-form'

describe('Task 3.5 — login SSO button', () => {
  it('renders the SSO link when ssoEnabled is true', async () => {
    const html = renderToStaticMarkup(createElement(LoginForm, { ssoEnabled: true }))
    expect(html).toContain('href="/api/auth/sso/start"')
    expect(html).toMatch(/Sign in with SSO/i)
  })

  it('does NOT render the SSO link when ssoEnabled is false (default)', async () => {
    const html = renderToStaticMarkup(createElement(LoginForm, { ssoEnabled: false }))
    expect(html).not.toContain('/api/auth/sso/start')
    expect(html).not.toMatch(/Sign in with SSO/i)
  })
})
