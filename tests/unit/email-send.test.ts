import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Unit tests for src/lib/email/send.ts
// Mock: nodemailer, smtp-config-repo, @/lib/config/repo

const { isSmtpConfigured, getSmtpConfig, sendMailMock, getAppConfig } = vi.hoisted(() => ({
  isSmtpConfigured: vi.fn<() => Promise<boolean>>(),
  getSmtpConfig: vi.fn<() => Promise<unknown>>(),
  sendMailMock: vi.fn<() => Promise<{ messageId: string }>>(),
  getAppConfig: vi.fn<() => Promise<string | null>>(),
}))

vi.mock('@/lib/config/smtp-config-repo', () => ({
  isSmtpConfigured,
  getSmtpConfig,
}))

vi.mock('@/lib/config/repo', () => ({
  getAppConfig,
}))

// Mock nodemailer dynamic import
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: sendMailMock,
    })),
  },
  createTransport: vi.fn(() => ({
    sendMail: sendMailMock,
  })),
}))

import { sendEmail } from '@/lib/email/send'

const SMTP_CONFIG = {
  host: 'smtp.example.com',
  port: 587,
  user: 'user@example.com',
  fromAddress: 'noreply@example.com',
  tls: 'starttls' as const,
}

const MOCK_PASSWORD = 'super-secret-smtp-password'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sendEmail — unconfigured', () => {
  it('returns { ok: false, error: smtp_not_configured } when isSmtpConfigured is false', async () => {
    isSmtpConfigured.mockResolvedValue(false)
    const result = await sendEmail({ to: 'a@b.com', subject: 'Test', text: 'Hello' })
    expect(result).toEqual({ ok: false, error: 'smtp_not_configured' })
    expect(sendMailMock).not.toHaveBeenCalled()
  })
})

describe('sendEmail — configured', () => {
  beforeEach(() => {
    isSmtpConfigured.mockResolvedValue(true)
    getSmtpConfig.mockResolvedValue(SMTP_CONFIG)
    getAppConfig.mockResolvedValue(MOCK_PASSWORD)
    sendMailMock.mockResolvedValue({ messageId: 'msg-123' })
  })

  it('calls sendMail with correct from, to, subject, text', async () => {
    await sendEmail({ to: 'recipient@example.com', subject: 'Hi', text: 'Body text' })

    expect(sendMailMock).toHaveBeenCalledTimes(1)
    const [mailOptions] = sendMailMock.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(mailOptions.from).toBe('noreply@example.com')
    expect(mailOptions.to).toBe('recipient@example.com')
    expect(mailOptions.subject).toBe('Hi')
    expect(mailOptions.text).toBe('Body text')
  })

  it('returns { ok: true, messageId } on success', async () => {
    const result = await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T' })
    expect(result).toEqual({ ok: true, messageId: 'msg-123' })
  })
})

describe('sendEmail — TLS modes', () => {
  beforeEach(() => {
    isSmtpConfigured.mockResolvedValue(true)
    getAppConfig.mockResolvedValue(MOCK_PASSWORD)
    sendMailMock.mockResolvedValue({ messageId: 'x' })
  })

  it("tls:'tls' → secure: true", async () => {
    const nodemailer = await import('nodemailer')
    getSmtpConfig.mockResolvedValue({ ...SMTP_CONFIG, tls: 'tls' })
    await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T' })
    const calls = (nodemailer.createTransport as ReturnType<typeof vi.fn>).mock.calls
    const lastCall = calls[calls.length - 1] as [Record<string, unknown>]
    expect(lastCall[0].secure).toBe(true)
  })

  it("tls:'starttls' → secure: false, requireTLS: true", async () => {
    const nodemailer = await import('nodemailer')
    getSmtpConfig.mockResolvedValue({ ...SMTP_CONFIG, tls: 'starttls' })
    await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T' })
    const calls = (nodemailer.createTransport as ReturnType<typeof vi.fn>).mock.calls
    const lastCall = calls[calls.length - 1] as [Record<string, unknown>]
    expect(lastCall[0].secure).toBe(false)
    expect(lastCall[0].requireTLS).toBe(true)
  })

  it("tls:'none' → secure: false, ignoreTLS: true", async () => {
    const nodemailer = await import('nodemailer')
    getSmtpConfig.mockResolvedValue({ ...SMTP_CONFIG, tls: 'none' })
    await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T' })
    const calls = (nodemailer.createTransport as ReturnType<typeof vi.fn>).mock.calls
    const lastCall = calls[calls.length - 1] as [Record<string, unknown>]
    expect(lastCall[0].secure).toBe(false)
    expect(lastCall[0].ignoreTLS).toBe(true)
  })
})

describe('sendEmail — transport error', () => {
  it('returns { ok: false, error } without throwing', async () => {
    isSmtpConfigured.mockResolvedValue(true)
    getSmtpConfig.mockResolvedValue(SMTP_CONFIG)
    getAppConfig.mockResolvedValue(MOCK_PASSWORD)
    sendMailMock.mockRejectedValue(new Error('Connection refused'))

    const result = await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T' })
    expect(result).toMatchObject({ ok: false })
    expect((result as { ok: false; error: string }).error).toContain('Connection refused')
  })
})

describe('sendEmail — password security', () => {
  it('SMTP password never appears in console.log or console.error calls', async () => {
    const logSpy = vi.spyOn(console, 'log')
    const errorSpy = vi.spyOn(console, 'error')

    isSmtpConfigured.mockResolvedValue(true)
    getSmtpConfig.mockResolvedValue(SMTP_CONFIG)
    getAppConfig.mockResolvedValue(MOCK_PASSWORD)
    sendMailMock.mockRejectedValue(new Error('SMTP failure'))

    await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T' })

    const allLogArgs = [...logSpy.mock.calls.flat(), ...errorSpy.mock.calls.flat()].map((v) =>
      typeof v === 'string' ? v : JSON.stringify(v),
    )

    for (const arg of allLogArgs) {
      expect(arg).not.toContain(MOCK_PASSWORD)
    }
  })
})

describe('sendEmail — array recipients', () => {
  it('to as array → joined string for nodemailer', async () => {
    isSmtpConfigured.mockResolvedValue(true)
    getSmtpConfig.mockResolvedValue(SMTP_CONFIG)
    getAppConfig.mockResolvedValue(MOCK_PASSWORD)
    sendMailMock.mockResolvedValue({ messageId: 'abc' })

    await sendEmail({ to: ['a@b.com', 'c@d.com'], subject: 'S', text: 'T' })

    const [mailOptions] = sendMailMock.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(mailOptions.to).toBe('a@b.com,c@d.com')
  })
})
