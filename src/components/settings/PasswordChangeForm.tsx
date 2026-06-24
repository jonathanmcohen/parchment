'use client'

import { useState } from 'react'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy'

// Client island for the Security page "Password" section. Posts to
// POST /api/auth/password, which verifies the current password server-side and
// rotates the stored argon2id hash. No secret ever touches @/db here; the form
// only sends the two plaintext fields over the existing session.

const ERROR_MESSAGES: Record<string, string> = {
  invalid_body: 'Fill in both the current and new password.',
  password_too_short: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  invalid_current_password: 'Your current password is incorrect.',
  no_password_set: 'This account has no password to change.',
  unauthorized: 'Your session has expired. Sign in again.',
}

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        setStatus({ kind: 'ok', message: 'Password updated.' })
        setCurrentPassword('')
        setNewPassword('')
        return
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      const message =
        (data?.error && ERROR_MESSAGES[data.error]) || 'Could not update your password.'
      setStatus({ kind: 'error', message })
    } catch {
      setStatus({ kind: 'error', message: 'Could not reach the server. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="security-current-password" className="font-medium text-sm">
          Current password
        </label>
        <input
          id="security-current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="security-new-password" className="font-medium text-sm">
          New password
        </label>
        <input
          id="security-new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
        <p className="text-[var(--muted)] text-xs">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>

      {status ? (
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={
            status.kind === 'error' ? 'text-[var(--accent)] text-sm' : 'text-[var(--muted)] text-sm'
          }
        >
          {status.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || currentPassword.length === 0 || newPassword.length === 0}
        className="self-start rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm text-[var(--on-primary)] disabled:opacity-60"
      >
        Update password
      </button>
    </form>
  )
}
