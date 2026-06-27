import { beforeEach, describe, expect, it, vi } from 'vitest'

// Unit tests for src/lib/notifications/send.ts
// Mocks: sendEmail, @/lib/auth/users-repo (getUser)

const { sendEmail, getUser } = vi.hoisted(() => ({
  sendEmail: vi.fn<() => Promise<unknown>>(),
  getUser: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('@/lib/email/send', () => ({ sendEmail }))
vi.mock('@/lib/auth/users-repo', () => ({ getUser }))

import { sendNotification } from '@/lib/notifications/send'

const MOCK_USER = {
  id: 'user-123',
  email: 'recipient@example.com',
  name: 'Alice',
  role: 'editor',
  disabledAt: null,
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sendNotification — successful path', () => {
  it('resolves user email from DB and calls sendEmail with correct args', async () => {
    getUser.mockResolvedValue(MOCK_USER)
    sendEmail.mockResolvedValue({ ok: true, messageId: 'msg-abc' })

    await sendNotification({
      userId: 'user-123',
      subject: 'You were mentioned',
      text: 'Alice mentioned you in a document.',
    })

    expect(getUser).toHaveBeenCalledWith('user-123')
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'recipient@example.com',
        subject: 'You were mentioned',
        text: 'Alice mentioned you in a document.',
      }),
    )
  })

  it('returns { ok: true } when sendEmail returns { ok: true, messageId }', async () => {
    getUser.mockResolvedValue(MOCK_USER)
    sendEmail.mockResolvedValue({ ok: true, messageId: 'msg-abc' })

    const result = await sendNotification({
      userId: 'user-123',
      subject: 'Test',
      text: 'Test body',
    })

    expect(result).toEqual({ ok: true })
  })
})

describe('sendNotification — sendEmail failure', () => {
  it('returns { ok: false, error } when sendEmail returns { ok: false }', async () => {
    getUser.mockResolvedValue(MOCK_USER)
    sendEmail.mockResolvedValue({ ok: false, error: 'smtp_not_configured' })

    const result = await sendNotification({
      userId: 'user-123',
      subject: 'Test',
      text: 'Body',
    })

    expect(result).toMatchObject({ ok: false })
    expect((result as { ok: false; error: string }).error).toBe('smtp_not_configured')
  })
})

describe('sendNotification — user not found', () => {
  it('returns { ok: false, error: user_not_found } when userId has no matching user', async () => {
    getUser.mockResolvedValue(null)

    const result = await sendNotification({
      userId: 'unknown-user-id',
      subject: 'Test',
      text: 'Body',
    })

    expect(result).toEqual({ ok: false, error: 'user_not_found' })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('sendNotification — never throws', () => {
  it('does not throw when sendEmail rejects unexpectedly', async () => {
    getUser.mockResolvedValue(MOCK_USER)
    sendEmail.mockRejectedValue(new Error('Unexpected failure'))

    const result = await sendNotification({
      userId: 'user-123',
      subject: 'Test',
      text: 'Body',
    })

    expect(result).toMatchObject({ ok: false })
  })

  it('does not throw when getUser rejects', async () => {
    getUser.mockRejectedValue(new Error('DB connection lost'))

    const result = await sendNotification({
      userId: 'user-123',
      subject: 'Test',
      text: 'Body',
    })

    expect(result).toMatchObject({ ok: false })
  })
})
