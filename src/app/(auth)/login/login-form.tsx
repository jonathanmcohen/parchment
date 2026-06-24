'use client'

import { useActionState, useState } from 'react'
import { type LoginState, login } from './actions'

const initialState: LoginState = null

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState)

  // Once the password step returns mfaRequired, swap to the second-factor step.
  if (state && 'mfaRequired' in state) {
    return <SecondFactorStep hasTotp={state.hasTotp} hasPasskey={state.hasPasskey} />
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="font-medium text-sm">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="font-medium text-sm">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
        />
      </div>

      {state && 'error' in state ? (
        <p role="alert" className="text-[var(--error)] text-sm">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--primary)] px-4 py-2 font-medium text-[var(--on-primary)] disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

// The post-password challenge: a TOTP/recovery code field and, when registered,
// a passkey button. On success the pending session is promoted and we navigate
// to the app root.
function SecondFactorStep({ hasTotp, hasPasskey }: { hasTotp: boolean; hasPasskey: boolean }) {
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload = useRecovery ? { recoveryCode: code } : { token: code }
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        window.location.assign('/')
        return
      }
      setError('That code was not accepted. Try again.')
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function usePasskey() {
    setBusy(true)
    setError(null)
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const optRes = await fetch('/api/auth/passkey/auth/options', { method: 'POST' })
      if (!optRes.ok) throw new Error('options')
      const optionsJSON = await optRes.json()
      const assertion = await startAuthentication({ optionsJSON })
      const verifyRes = await fetch('/api/auth/passkey/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      })
      if (verifyRes.ok) {
        window.location.assign('/')
        return
      }
      setError('Passkey sign-in failed. Try a code instead.')
    } catch {
      setError('Passkey sign-in was cancelled or failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-lg">Two-factor authentication</h2>
        <p className="text-[var(--muted)] text-sm">
          {useRecovery
            ? 'Enter one of your saved recovery codes.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>

      {hasPasskey ? (
        <button
          type="button"
          onClick={usePasskey}
          disabled={busy}
          className="rounded-lg border border-[var(--border)] px-4 py-2 font-medium text-sm disabled:opacity-60"
        >
          Use a passkey
        </button>
      ) : null}

      {hasTotp ? (
        <form onSubmit={submitCode} className="flex flex-col gap-3">
          <label htmlFor="mfa-code" className="sr-only">
            {useRecovery ? 'Recovery code' : 'Authentication code'}
          </label>
          <input
            id="mfa-code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={useRecovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            placeholder={useRecovery ? 'xxxx-xxxx-xxxx-xxxx' : '123456'}
            // biome-ignore lint/a11y/noAutofocus: focus the only field on this step
            autoFocus
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 tracking-widest"
          />
          <button
            type="submit"
            disabled={busy || code.trim().length === 0}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 font-medium text-[var(--on-primary)] disabled:opacity-60"
          >
            {busy ? 'Verifying…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => {
              setUseRecovery((v) => !v)
              setCode('')
              setError(null)
            }}
            className="text-[var(--muted)] text-sm underline-offset-2 hover:underline"
          >
            {useRecovery ? 'Use an authenticator code instead' : 'Use a recovery code instead'}
          </button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-[var(--error)] text-sm">
          {error}
        </p>
      ) : null}
    </div>
  )
}
