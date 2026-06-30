'use client'
// CopyableUrlField — a read-only URL display with a copy button. Used by the SSO
// config UI (#3 redirect_uri, #9 post-logout redirect) so an operator can copy the
// exact value to register at their IdP. The value is server-computed from
// PARCHMENT_PUBLIC_URL and passed in as a prop; this component is display-only.
import { useId, useState } from 'react'

export function CopyableUrlField({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  const inputId = useId()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable (insecure context / no permission) — no-op
    }
  }

  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block font-medium text-sm">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={value}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
        <button
          type="button"
          onClick={() => void copy()}
          aria-live="polite"
          className="shrink-0 rounded-md border border-[var(--border)] px-3 py-2 font-medium text-sm hover:bg-[var(--paper)]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {hint ? <p className="mt-1 text-[var(--muted)] text-xs">{hint}</p> : null}
    </div>
  )
}
