'use client'
// OidcConfigForm — admin-only OIDC SSO configuration form (G2). Mirrors the SMTP
// form: the client secret is WRITE-ONLY (shows the mask when stored, blank = unchanged)
// and never travels back to the client. Exports an injectable saveOidcConfigRequest
// handler so it is testable without JSX.
import { useState } from 'react'

const SECRET_MASK = '••••••••'

export type OidcFormValues = {
  enabled: boolean
  issuerUrl: string
  clientId: string
  clientSecret: string
  scopes: string
}

export type OidcSaveResult = { ok: true } | { ok: false; error: string }

type FetchDep = { fetch?: typeof fetch }

// PUTs the form values to /api/settings/sso. Hoisted local fetch avoids the
// this-binding pitfall (a member call would bind `this` to deps → Illegal invocation).
export async function saveOidcConfigRequest(
  values: OidcFormValues,
  deps: FetchDep = {},
): Promise<OidcSaveResult> {
  const doFetch = deps.fetch ?? fetch
  const res = await doFetch('/api/settings/sso', {
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

type Feedback =
  | { type: 'idle' }
  | { type: 'saving' }
  | { type: 'saved' }
  | { type: 'error'; message: string }

export function OidcConfigForm({ initial }: { initial: OidcFormValues }) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [issuerUrl, setIssuerUrl] = useState(initial.issuerUrl)
  const [clientId, setClientId] = useState(initial.clientId)
  const [clientSecret, setClientSecret] = useState(initial.clientSecret)
  const [secretFocused, setSecretFocused] = useState(false)
  const [scopes, setScopes] = useState(initial.scopes)
  const [feedback, setFeedback] = useState<Feedback>({ type: 'idle' })

  async function handleSave() {
    setFeedback({ type: 'saving' })
    const result = await saveOidcConfigRequest({
      enabled,
      issuerUrl,
      clientId,
      clientSecret,
      scopes,
    })
    if (result.ok) {
      setFeedback({ type: 'saved' })
      if (clientSecret !== '' && clientSecret !== SECRET_MASK) setClientSecret(SECRET_MASK)
    } else {
      setFeedback({ type: 'error', message: result.error })
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable single sign-on (OIDC)
      </label>

      <div>
        <label htmlFor="oidc-issuer" className={labelClass}>
          Issuer URL
        </label>
        <input
          id="oidc-issuer"
          type="url"
          value={issuerUrl}
          onChange={(e) => setIssuerUrl(e.target.value)}
          placeholder="https://idp.example.com"
          className={fieldClass}
          autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor="oidc-client-id" className={labelClass}>
          Client ID
        </label>
        <input
          id="oidc-client-id"
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={fieldClass}
          autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor="oidc-client-secret" className={labelClass}>
          Client secret
        </label>
        <input
          id="oidc-client-secret"
          type="password"
          value={secretFocused && clientSecret === SECRET_MASK ? '' : clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          onFocus={() => {
            setSecretFocused(true)
            if (clientSecret === SECRET_MASK) setClientSecret('')
          }}
          onBlur={() => {
            setSecretFocused(false)
            if (clientSecret === '')
              setClientSecret(initial.clientSecret === SECRET_MASK ? SECRET_MASK : '')
          }}
          placeholder={initial.clientSecret === SECRET_MASK ? SECRET_MASK : 'Enter client secret'}
          className={fieldClass}
          autoComplete="new-password"
        />
        <p className="mt-1 text-[var(--muted)] text-xs">
          Stored encrypted. Leave unchanged to keep the existing secret.
        </p>
      </div>

      <div>
        <label htmlFor="oidc-scopes" className={labelClass}>
          Scopes
        </label>
        <input
          id="oidc-scopes"
          type="text"
          value={scopes}
          onChange={(e) => setScopes(e.target.value)}
          placeholder="openid email profile"
          className={fieldClass}
          autoComplete="off"
        />
      </div>

      {(feedback.type === 'error' || feedback.type === 'saved') && (
        <div
          role="alert"
          aria-live="polite"
          className={
            feedback.type === 'error'
              ? 'rounded-md border border-[var(--error,#dc2626)] bg-[var(--error-bg,#fef2f2)] px-3 py-2 text-sm text-[var(--error,#dc2626)]'
              : 'rounded-md border border-[var(--success,#16a34a)] bg-[var(--success-bg,#f0fdf4)] px-3 py-2 text-sm text-[var(--success,#16a34a)]'
          }
        >
          {feedback.type === 'saved' && 'Settings saved.'}
          {feedback.type === 'error' && `Error: ${feedback.message}`}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={feedback.type === 'saving'}
          className="rounded-md bg-[var(--primary)] px-4 py-2 font-medium text-sm text-[var(--on-primary)] disabled:opacity-60"
        >
          {feedback.type === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
