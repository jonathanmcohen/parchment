'use client'

import { useCallback, useEffect, useState } from 'react'

type TotpStatus = { enabled: boolean; recoveryCodesRemaining: number }
type Passkey = { id: string; label: string; createdAt: string }

type InitResult = { uri: string; qrDataUrl: string; recoveryCodes: string[] }

// Client island for the Security settings page: TOTP enrollment + passkey
// management. All crypto/secret handling happens server-side; this component
// only drives the ceremonies and shows one-time recovery codes.
export function MfaSection() {
  const [totp, setTotp] = useState<TotpStatus | null>(null)
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null)

  const refresh = useCallback(async () => {
    const [t, p] = await Promise.all([
      fetch('/api/auth/mfa/totp').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/auth/passkey').then((r) => (r.ok ? r.json() : null)),
    ])
    setTotp(t)
    setPasskeys(p?.passkeys ?? [])
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <>
      <TotpPanel status={totp} onChange={refresh} />
      <PasskeyPanel passkeys={passkeys} onChange={refresh} />
    </>
  )
}

function TotpPanel({
  status,
  onChange,
}: {
  status: TotpStatus | null
  onChange: () => Promise<void>
}) {
  const [enroll, setEnroll] = useState<InitResult | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function begin() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/mfa/totp/init', { method: 'POST' })
      if (!res.ok) throw new Error()
      setEnroll((await res.json()) as InitResult)
    } catch {
      setError('Could not start enrollment.')
    } finally {
      setBusy(false)
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/mfa/totp/enable', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: code }),
      })
      if (!res.ok) {
        setError('That code was not accepted.')
        return
      }
      setEnroll(null)
      setCode('')
      await onChange()
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    const token = window.prompt('Enter a current authenticator code to disable two-factor:')
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/mfa/totp/disable', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) {
        setError('Could not disable — the code was not accepted.')
        return
      }
      await onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] p-4">
      <h3 className="font-medium text-sm">Authenticator app (TOTP)</h3>

      {status?.enabled ? (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[var(--muted)] text-sm">
            Enabled · {status.recoveryCodesRemaining} recovery codes left
          </p>
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-60"
          >
            Disable
          </button>
        </div>
      ) : enroll ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[var(--muted)] text-sm">
            Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
          </p>
          {/* biome-ignore lint/performance/noImgElement: data-URL QR, not a remote asset */}
          <img src={enroll.qrDataUrl} alt="TOTP QR code" width={180} height={180} />
          <details>
            <summary className="cursor-pointer text-[var(--muted)] text-xs">
              Can't scan? Enter the secret manually
            </summary>
            <code className="mt-1 block break-all text-xs">{enroll.uri}</code>
          </details>

          <div className="rounded-md border border-[var(--accent)] border-dashed p-3">
            <p className="font-medium text-sm">Recovery codes — save these now</p>
            <p className="text-[var(--muted)] text-xs">
              Each works once if you lose your authenticator. They are shown only this once.
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
              {enroll.recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>

          <form onSubmit={confirm} className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              placeholder="123456"
              className="w-32 rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-sm tracking-widest"
            />
            <button
              type="submit"
              disabled={busy || code.trim().length === 0}
              className="rounded-md bg-[var(--accent-contrast)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              Confirm
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[var(--muted)] text-sm">
            Use an authenticator app for a time-based second factor.
          </p>
          <button
            type="button"
            onClick={begin}
            disabled={busy}
            className="rounded-md bg-[var(--accent-contrast)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
          >
            Set up
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-[var(--accent)] text-sm">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function PasskeyPanel({
  passkeys,
  onChange,
}: {
  passkeys: Passkey[] | null
  onChange: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function register() {
    setBusy(true)
    setError(null)
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')
      const optRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' })
      if (!optRes.ok) throw new Error()
      const optionsJSON = await optRes.json()
      const attestation = await startRegistration({ optionsJSON })
      const label = window.prompt('Name this passkey:', 'My device') ?? 'Passkey'
      const verifyRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: attestation, label }),
      })
      if (!verifyRes.ok) {
        setError('Could not register the passkey.')
        return
      }
      await onChange()
    } catch {
      setError('Passkey registration was cancelled or failed.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/passkey', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) await onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">Passkeys</h3>
        <button
          type="button"
          onClick={register}
          disabled={busy}
          className="rounded-md bg-[var(--accent-contrast)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          Add passkey
        </button>
      </div>

      {passkeys && passkeys.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between text-sm">
              <span>{p.label}</span>
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={busy}
                className="text-[var(--muted)] underline-offset-2 hover:underline disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[var(--muted)] text-sm">
          Register a passkey to sign in with your device's biometrics or a security key.
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-[var(--accent)] text-sm">
          {error}
        </p>
      ) : null}
    </div>
  )
}
