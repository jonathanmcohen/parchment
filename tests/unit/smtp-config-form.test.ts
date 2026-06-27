// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// DOM/structural tests for SmtpConfigForm.
// Following the account-theme-select.test.ts pattern:
//   - structural rendering assertions via renderToStaticMarkup (SSR probe)
//   - business logic (save / test-email) via handler functions injected into the component
//
// The form's fetch calls go through saveSMTPConfig / testSmtpConfig handler
// functions that accept an injectable `fetch`-like dependency — same pattern as
// applyColorScheme. This keeps JSX out of the test while still covering the
// contract thoroughly.

// Stub next/navigation so the client component can be imported in jsdom
// (top-level — hoisted by vitest automatically)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => '/settings/admin/smtp',
}))

const SECRET_MASK = '••••••••'

import {
  type SmtpFormValues,
  saveSMTPConfig,
  testSmtpConfig,
} from '@/components/settings/SmtpConfigForm'

const CONFIGURED_VALUES: SmtpFormValues = {
  host: 'smtp.example.com',
  port: 587,
  user: 'user@example.com',
  fromAddress: 'noreply@example.com',
  tls: 'starttls',
  password: SECRET_MASK,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('saveSMTPConfig — PUT /api/settings/smtp', () => {
  it('PUTs with correct body and returns ok on success', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, ...CONFIGURED_VALUES }), { status: 200 }),
    )

    const result = await saveSMTPConfig(CONFIGURED_VALUES, { fetch: fetchMock as typeof fetch })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/settings/smtp')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body as string) as SmtpFormValues
    expect(body.host).toBe('smtp.example.com')
    expect(body.port).toBe(587)
    expect(result.ok).toBe(true)
  })

  it('returns error string on PUT failure (non-2xx)', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ error: 'validation failed' }), { status: 400 }),
    )

    const result = await saveSMTPConfig(CONFIGURED_VALUES, { fetch: fetchMock as typeof fetch })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(typeof result.error).toBe('string')
  })

  it('sends password: SECRET_MASK when password field holds the mask', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await saveSMTPConfig(
      { ...CONFIGURED_VALUES, password: SECRET_MASK },
      {
        fetch: fetchMock as typeof fetch,
      },
    )

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(init.body as string) as SmtpFormValues
    // The mask is forwarded to the server; the server-side repo guards against double-encrypt
    expect(body.password).toBe(SECRET_MASK)
  })
})

describe('testSmtpConfig — POST /api/settings/smtp/test', () => {
  it('POSTs to /api/settings/smtp/test with the current form values', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const result = await testSmtpConfig(CONFIGURED_VALUES, { fetch: fetchMock as typeof fetch })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/settings/smtp/test')
    expect(init.method).toBe('POST')
    expect(result.ok).toBe(true)
  })

  it('returns { ok: false, error } when the test endpoint fails', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'Connection refused' }), { status: 200 }),
    )

    const result = await testSmtpConfig(CONFIGURED_VALUES, { fetch: fetchMock as typeof fetch })
    expect(result.ok).toBe(false)
  })
})

describe('SmtpConfigForm — structural rendering (SSR probe)', () => {
  beforeEach(() => {
    // next/navigation is already mocked at top level
  })

  it('renders all six labelled fields in SSR output', async () => {
    const { SmtpConfigForm } = await import('@/components/settings/SmtpConfigForm')

    const html = renderToStaticMarkup(
      createElement(SmtpConfigForm, {
        initialConfig: {
          configured: false,
          host: '',
          port: 587,
          user: '',
          fromAddress: '',
          tls: 'starttls' as const,
          password: '',
        },
      }),
    )

    // All six fields must be present
    expect(html).toContain('id="smtp-host"')
    expect(html).toContain('id="smtp-port"')
    expect(html).toContain('id="smtp-user"')
    expect(html).toContain('id="smtp-password"')
    expect(html).toContain('id="smtp-from"')
    expect(html).toContain('id="smtp-tls"')
  })

  it('password field is always type="password"', async () => {
    const { SmtpConfigForm } = await import('@/components/settings/SmtpConfigForm')

    const html = renderToStaticMarkup(
      createElement(SmtpConfigForm, {
        initialConfig: {
          configured: true,
          host: 'smtp.example.com',
          port: 587,
          user: 'user@example.com',
          fromAddress: 'noreply@example.com',
          tls: 'starttls' as const,
          password: SECRET_MASK,
        },
      }),
    )

    // Must contain type="password" for the password input — not type="text"
    expect(html).toContain('type="password"')
    // Must NOT contain type="text" for a password field
    // (other text fields are type="text"; but the password input must never be text)
    expect(html).not.toMatch(/id="smtp-password"[^>]*type="text"/)
  })

  it('password field initial value is SECRET_MASK when password === SECRET_MASK', async () => {
    const { SmtpConfigForm } = await import('@/components/settings/SmtpConfigForm')

    const html = renderToStaticMarkup(
      createElement(SmtpConfigForm, {
        initialConfig: {
          configured: true,
          host: 'smtp.example.com',
          port: 587,
          user: 'user@example.com',
          fromAddress: 'noreply@example.com',
          tls: 'starttls' as const,
          password: SECRET_MASK,
        },
      }),
    )

    // The mask value should appear in the HTML (as the defaultValue of the password input)
    expect(html).toContain(SECRET_MASK)
  })
})
