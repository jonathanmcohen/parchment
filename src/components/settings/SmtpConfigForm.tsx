'use client'
// SmtpConfigForm — admin-only SMTP configuration form.
// Exports:
//   SmtpConfigForm        — the React component
//   saveSMTPConfig        — injectable handler (testable without JSX)
//   testSmtpConfig        — injectable handler (testable without JSX)
//   SmtpFormValues        — the shared form value type
import { useState } from 'react'

const SECRET_MASK = '••••••••'

export type TlsMode = 'none' | 'tls' | 'starttls'

export type SmtpFormValues = {
  host: string
  port: number
  user: string
  fromAddress: string
  tls: TlsMode
  password: string
}

export type SmtpSaveResult = { ok: true } | { ok: false; error: string }

type FetchDep = { fetch?: typeof fetch }

/**
 * Sends the form values to PUT /api/settings/smtp.
 * Injectable `fetch` dep for unit testing (follows account-theme-handler pattern).
 */
export async function saveSMTPConfig(
  values: SmtpFormValues,
  deps: FetchDep = {},
): Promise<SmtpSaveResult> {
  const _fetch = deps.fetch ?? fetch
  const res = await _fetch('/api/settings/smtp', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  if (!res.ok) {
    let error = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) error = data.error
    } catch {
      // ignore parse failure
    }
    return { ok: false, error }
  }
  return { ok: true }
}

/**
 * Sends current form values to POST /api/settings/smtp/test.
 * Injectable `fetch` dep for unit testing.
 */
export async function testSmtpConfig(
  values: SmtpFormValues,
  deps: FetchDep = {},
): Promise<SmtpSaveResult> {
  const _fetch = deps.fetch ?? fetch
  const res = await _fetch('/api/settings/smtp/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...values, to: undefined }),
  })
  let data: { ok: boolean; error?: string } = { ok: false }
  try {
    data = (await res.json()) as { ok: boolean; error?: string }
  } catch {
    return { ok: false, error: 'Invalid response from server' }
  }
  if (!data.ok) {
    return { ok: false, error: data.error ?? 'Test failed' }
  }
  return { ok: true }
}

export type SmtpInitialConfig =
  | {
      configured: false
      host: string
      port: number
      user: string
      fromAddress: string
      tls: TlsMode
      password: string
    }
  | {
      configured: true
      host: string
      port: number
      user: string
      fromAddress: string
      tls: TlsMode
      password: string
    }

type FeedbackState =
  | { type: 'idle' }
  | { type: 'saving' }
  | { type: 'testing' }
  | { type: 'saved' }
  | { type: 'error'; message: string }
  | { type: 'test-ok' }
  | { type: 'test-error'; message: string }

export function SmtpConfigForm({ initialConfig }: { initialConfig: SmtpInitialConfig }) {
  const [host, setHost] = useState(initialConfig.host)
  const [port, setPort] = useState(initialConfig.port)
  const [user, setUser] = useState(initialConfig.user)
  const [fromAddress, setFromAddress] = useState(initialConfig.fromAddress)
  const [tls, setTls] = useState<TlsMode>(initialConfig.tls)
  // Password starts as SECRET_MASK when a password is already stored.
  // On focus the field clears so the user can type a new one.
  const [password, setPassword] = useState(initialConfig.password)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>({ type: 'idle' })

  const formValues: SmtpFormValues = { host, port, user, fromAddress, tls, password }

  async function handleSave() {
    setFeedback({ type: 'saving' })
    const result = await saveSMTPConfig(formValues)
    if (result.ok) {
      setFeedback({ type: 'saved' })
      // Restore mask if we saved a real password successfully
      if (password !== '' && password !== SECRET_MASK) {
        setPassword(SECRET_MASK)
      }
    } else {
      setFeedback({ type: 'error', message: result.error })
    }
  }

  async function handleTest() {
    setFeedback({ type: 'testing' })
    const result = await testSmtpConfig(formValues)
    if (result.ok) {
      setFeedback({ type: 'test-ok' })
    } else {
      setFeedback({ type: 'test-error', message: result.error })
    }
  }

  const fieldClass =
    'w-full rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]'
  const labelClass = 'block font-medium text-sm mb-1'

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void handleSave()
      }}
    >
      {/* Host */}
      <div>
        <label htmlFor="smtp-host" className={labelClass}>
          Host
        </label>
        <input
          id="smtp-host"
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="smtp.example.com"
          className={fieldClass}
          autoComplete="off"
        />
      </div>

      {/* Port */}
      <div>
        <label htmlFor="smtp-port" className={labelClass}>
          Port
        </label>
        <input
          id="smtp-port"
          type="number"
          min={1}
          max={65535}
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          className={fieldClass}
        />
      </div>

      {/* Username */}
      <div>
        <label htmlFor="smtp-user" className={labelClass}>
          Username
        </label>
        <input
          id="smtp-user"
          type="text"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="user@example.com"
          className={fieldClass}
          autoComplete="username"
        />
      </div>

      {/* Password */}
      <div>
        <label htmlFor="smtp-password" className={labelClass}>
          Password
        </label>
        <input
          id="smtp-password"
          type="password"
          value={passwordFocused && password === SECRET_MASK ? '' : password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => {
            setPasswordFocused(true)
            // Clear the mask so the user can type a new value
            if (password === SECRET_MASK) setPassword('')
          }}
          onBlur={() => {
            setPasswordFocused(false)
            // If user left the field empty after clearing the mask, restore it
            if (password === '')
              setPassword(initialConfig.password === SECRET_MASK ? SECRET_MASK : '')
          }}
          placeholder={initialConfig.password === SECRET_MASK ? SECRET_MASK : 'Enter password'}
          className={fieldClass}
          autoComplete="current-password"
        />
        <p className="mt-1 text-[var(--muted)] text-xs">
          Leave unchanged to keep the existing password.
        </p>
      </div>

      {/* From address */}
      <div>
        <label htmlFor="smtp-from" className={labelClass}>
          From address
        </label>
        <input
          id="smtp-from"
          type="email"
          value={fromAddress}
          onChange={(e) => setFromAddress(e.target.value)}
          placeholder="noreply@example.com"
          className={fieldClass}
        />
      </div>

      {/* TLS mode */}
      <div>
        <label htmlFor="smtp-tls" className={labelClass}>
          TLS mode
        </label>
        <select
          id="smtp-tls"
          value={tls}
          onChange={(e) => setTls(e.target.value as TlsMode)}
          className={fieldClass}
        >
          <option value="none">None (plain SMTP)</option>
          <option value="tls">TLS (implicit, port 465)</option>
          <option value="starttls">STARTTLS (opportunistic, port 587)</option>
        </select>
      </div>

      {/* Inline feedback */}
      {(feedback.type === 'error' ||
        feedback.type === 'test-error' ||
        feedback.type === 'saved' ||
        feedback.type === 'test-ok') && (
        <div
          role="alert"
          aria-live="polite"
          className={
            feedback.type === 'error' || feedback.type === 'test-error'
              ? 'rounded-md border border-[var(--error,#dc2626)] bg-[var(--error-bg,#fef2f2)] px-3 py-2 text-sm text-[var(--error,#dc2626)]'
              : 'rounded-md border border-[var(--success,#16a34a)] bg-[var(--success-bg,#f0fdf4)] px-3 py-2 text-sm text-[var(--success,#16a34a)]'
          }
        >
          {feedback.type === 'saved' && 'Settings saved.'}
          {feedback.type === 'test-ok' && 'Test email sent successfully.'}
          {feedback.type === 'error' && `Error: ${feedback.message}`}
          {feedback.type === 'test-error' && `Test failed: ${feedback.message}`}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={feedback.type === 'saving'}
          className="rounded-md bg-[var(--primary)] px-4 py-2 font-medium text-sm text-[var(--on-primary)] disabled:opacity-60"
        >
          {feedback.type === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={feedback.type === 'testing'}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-4 py-2 text-sm disabled:opacity-60"
        >
          {feedback.type === 'testing' ? 'Sending…' : 'Send test email'}
        </button>
      </div>
    </form>
  )
}
