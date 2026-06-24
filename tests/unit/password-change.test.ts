import { describe, expect, it } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  parseChangePasswordBody,
  validateNewPassword,
} from '@/lib/auth/password-policy'

describe('validateNewPassword', () => {
  it('accepts a password at the minimum length', () => {
    expect(validateNewPassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull()
  })

  it('accepts a long password', () => {
    expect(validateNewPassword('a-perfectly-fine-passphrase')).toBeNull()
  })

  it('rejects a password shorter than the minimum', () => {
    expect(validateNewPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe('password_too_short')
  })

  it('rejects an empty password', () => {
    expect(validateNewPassword('')).toBe('password_too_short')
  })
})

describe('parseChangePasswordBody', () => {
  it('extracts currentPassword and newPassword from a well-formed body', () => {
    const parsed = parseChangePasswordBody({
      currentPassword: 'old-secret',
      newPassword: 'new-secret',
    })
    expect(parsed).toEqual({ currentPassword: 'old-secret', newPassword: 'new-secret' })
  })

  it('returns null when the body is not an object', () => {
    expect(parseChangePasswordBody(null)).toBeNull()
    expect(parseChangePasswordBody('nope')).toBeNull()
    expect(parseChangePasswordBody(42)).toBeNull()
  })

  it('returns null when either field is missing or non-string', () => {
    expect(parseChangePasswordBody({ currentPassword: 'old-secret' })).toBeNull()
    expect(parseChangePasswordBody({ newPassword: 'new-secret' })).toBeNull()
    expect(parseChangePasswordBody({ currentPassword: 1, newPassword: 'new-secret' })).toBeNull()
    expect(parseChangePasswordBody({ currentPassword: 'old-secret', newPassword: null })).toBeNull()
  })

  it('does not trim the passwords (spaces are valid characters)', () => {
    const parsed = parseChangePasswordBody({ currentPassword: ' a b ', newPassword: ' c d e f ' })
    expect(parsed).toEqual({ currentPassword: ' a b ', newPassword: ' c d e f ' })
  })
})
