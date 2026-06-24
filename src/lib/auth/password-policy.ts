// Pure password-policy helpers shared by the change-password route. No DB, no
// crypto, no server-only deps — kept pure so it is unit-testable in isolation
// (TDD) and importable from both the route handler and the test suite.

// Minimum acceptable password length. Mirrors the first-run owner-creation rule
// in src/app/setup/actions.ts so the bar is consistent across the app.
export const MIN_PASSWORD_LENGTH = 8

// Returns a stable error code when the candidate new password fails policy, or
// null when it is acceptable. Length only — a deliberate, predictable bar that
// matches setup; not a strength meter.
export function validateNewPassword(newPassword: string): 'password_too_short' | null {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return 'password_too_short'
  return null
}

export type ChangePasswordInput = {
  currentPassword: string
  newPassword: string
}

// Narrows an arbitrary parsed JSON body to the change-password shape, or null if
// it does not carry both string fields. Does NOT trim — whitespace is a valid
// part of a password, and trimming would silently alter the secret.
export function parseChangePasswordBody(body: unknown): ChangePasswordInput | null {
  if (typeof body !== 'object' || body === null) return null
  const { currentPassword, newPassword } = body as Record<string, unknown>
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') return null
  return { currentPassword, newPassword }
}
