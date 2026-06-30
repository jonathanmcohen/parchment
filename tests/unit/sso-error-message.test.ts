import { describe, expect, it } from 'vitest'
import { ssoErrorMessage } from '@/lib/auth/sso-error'

// v0.2.4 #3b: the /login SSO error mapping must distinguish the denial reasons
// (disabled vs unverified-email link) and never surface for a clean load.

describe('ssoErrorMessage', () => {
  it('returns null when there is no sso code (normal login page load)', () => {
    expect(ssoErrorMessage(null)).toBeNull()
    expect(ssoErrorMessage(null, 'disabled')).toBeNull()
  })

  it('explains a disabled account distinctly', () => {
    const msg = ssoErrorMessage('denied', 'disabled')
    expect(msg).toBeTruthy()
    expect(msg).toMatch(/disabled/i)
    expect(msg).toMatch(/administrator/i)
  })

  it('explains the unverified-email link block distinctly, mentioning email_verified', () => {
    const msg = ssoErrorMessage('denied', 'no_verified_email_for_link')
    expect(msg).toBeTruthy()
    expect(msg).toMatch(/verified email|email_verified/i)
    // It must be a DIFFERENT message from the disabled case (the whole point of #3b).
    expect(msg).not.toBe(ssoErrorMessage('denied', 'disabled'))
  })

  it('falls back to a generic denied message when no reason is given', () => {
    const msg = ssoErrorMessage('denied')
    expect(msg).toBeTruthy()
    expect(msg).toMatch(/refused|denied|administrator/i)
  })

  it('handles unavailable / error / invalid codes with non-empty messages', () => {
    expect(ssoErrorMessage('unavailable')).toMatch(/not available|administrator/i)
    expect(ssoErrorMessage('error')).toMatch(/could not start|try again/i)
    expect(ssoErrorMessage('invalid')).toMatch(/did not complete|try again/i)
  })

  it('does not leak the reason for an unknown code', () => {
    // An unexpected code should still produce a safe generic message, not crash.
    const msg = ssoErrorMessage('weird-code', 'secret-detail')
    expect(msg).toBeTruthy()
    expect(msg).not.toContain('secret-detail')
  })
})
