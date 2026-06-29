import { beforeEach, describe, expect, it, vi } from 'vitest'

// Unit tests for POST /api/settings/smtp/test
// All deps mocked: auth guard, nodemailer, smtp-config-repo

const { authenticateRequest, sendMailMock, getAppConfig, isAdmin } = vi.hoisted(() => ({
  authenticateRequest: vi.fn<() => Promise<unknown>>(),
  sendMailMock: vi.fn<() => Promise<{ messageId: string }>>(),
  getAppConfig: vi.fn<() => Promise<string | null>>(),
  isAdmin: vi.fn<(user: unknown) => boolean>(),
}))

vi.mock('@/lib/auth/guard', () => ({ authenticateRequest, isAdmin }))
vi.mock('@/lib/config/repo', () => ({ getAppConfig }))
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
  },
  createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
}))

const SECRET_MASK = '••••••••'

import { POST } from '@/app/api/settings/smtp/test/route'

const ADMIN_USER = { id: 'u1', role: 'admin', email: 'admin@example.com' }

function makeReq(body: Record<string, unknown> | null) {
  return {
    json: async () => {
      if (body === null) throw new Error('no body')
      return body
    },
  } as unknown as Request
}

const VALID_BODY = {
  host: 'smtp.example.com',
  port: 587,
  user: 'user@example.com',
  password: 'mypassword',
  // The form/save use `fromAddress`; the test endpoint must read the same key
  // (it previously read `from`, so every test send falsely failed validation).
  fromAddress: 'noreply@example.com',
  tls: 'starttls',
  to: 'test@example.com',
}

beforeEach(() => {
  vi.clearAllMocks()
  isAdmin.mockReturnValue(true)
})

describe('POST /api/settings/smtp/test — auth', () => {
  it('returns 401 when not authenticated', async () => {
    authenticateRequest.mockResolvedValue(null)
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 403 when authenticated but not admin', async () => {
    authenticateRequest.mockResolvedValue({ id: 'u2', role: 'editor' })
    isAdmin.mockReturnValue(false)
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/settings/smtp/test — validation', () => {
  beforeEach(() => {
    authenticateRequest.mockResolvedValue(ADMIN_USER)
  })

  it('returns 400 on missing host', async () => {
    const { host: _, ...rest } = VALID_BODY
    const res = await POST(makeReq(rest))
    expect(res.status).toBe(400)
  })

  it('returns 400 on missing port', async () => {
    const { port: _, ...rest } = VALID_BODY
    const res = await POST(makeReq(rest))
    expect(res.status).toBe(400)
  })

  it('returns 400 on missing fromAddress', async () => {
    const { fromAddress: _, ...rest } = VALID_BODY
    const res = await POST(makeReq(rest))
    expect(res.status).toBe(400)
  })

  it('accepts a body that uses fromAddress (the key the form actually sends)', async () => {
    authenticateRequest.mockResolvedValue(ADMIN_USER)
    sendMailMock.mockResolvedValue({ messageId: 'fa-1' })
    const res = await POST(makeReq(VALID_BODY))
    const body = await res.json()
    expect(body.ok).toBe(true)
    // The address the form supplied must be the envelope From.
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'noreply@example.com' }),
    )
  })

  it('returns 400 on missing tls', async () => {
    const { tls: _, ...rest } = VALID_BODY
    const res = await POST(makeReq(rest))
    expect(res.status).toBe(400)
  })

  it('returns 400 when port is 0 (out of range)', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, port: 0 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when port is 65536 (out of range)', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, port: 65536 }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/settings/smtp/test — masked password', () => {
  beforeEach(() => {
    authenticateRequest.mockResolvedValue(ADMIN_USER)
    sendMailMock.mockResolvedValue({ messageId: 'test-msg-1' })
  })

  it('reads stored password when password === SECRET_MASK', async () => {
    getAppConfig.mockResolvedValue('stored-smtp-password')
    const res = await POST(makeReq({ ...VALID_BODY, password: SECRET_MASK }))
    expect(getAppConfig).toHaveBeenCalledWith('smtp_password')
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

describe('POST /api/settings/smtp/test — send outcomes', () => {
  beforeEach(() => {
    authenticateRequest.mockResolvedValue(ADMIN_USER)
  })

  it('returns { ok: true } on transporter success', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'abc' })
    const res = await POST(makeReq(VALID_BODY))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(res.status).toBe(200)
  })

  it('returns { ok: false, error } on transporter failure (no 500)', async () => {
    sendMailMock.mockRejectedValue(new Error('Connection refused'))
    const res = await POST(makeReq(VALID_BODY))
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(typeof body.error).toBe('string')
    // Must not be a 500 — the route absorbs transport errors
    expect(res.status).toBe(200)
  })

  it('password not present in any logged output', async () => {
    const logSpy = vi.spyOn(console, 'log')
    const errorSpy = vi.spyOn(console, 'error')
    sendMailMock.mockRejectedValue(new Error('SMTP failure'))

    await POST(makeReq({ ...VALID_BODY, password: 'verysecretpassword' }))

    const allArgs = [...logSpy.mock.calls.flat(), ...errorSpy.mock.calls.flat()].map((v) =>
      typeof v === 'string' ? v : JSON.stringify(v),
    )
    for (const arg of allArgs) {
      expect(arg).not.toContain('verysecretpassword')
    }
  })
})
