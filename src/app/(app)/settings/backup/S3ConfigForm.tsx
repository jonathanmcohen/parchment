'use client'

import { type FormEvent, useState } from 'react'

// F1 — S3 config form (client island). Controlled form for the S3 fields; the
// secret shows '***' if already set (typing replaces the mask). Save → PUT;
// Test connection → POST the current unsaved values.

export interface S3FormInitial {
  endpoint: string
  bucket: string
  accessKeyId: string
  region: string
  prefix: string
  scheduleHours: number
  enabled: boolean
  /** '***' when a secret is stored, '' otherwise. */
  secretAccessKey: string
}

const MASK = '***'

export function S3ConfigForm({ initial }: { initial: S3FormInitial }) {
  const [endpoint, setEndpoint] = useState(initial.endpoint)
  const [bucket, setBucket] = useState(initial.bucket)
  const [accessKeyId, setAccessKeyId] = useState(initial.accessKeyId)
  const [secretAccessKey, setSecretAccessKey] = useState(initial.secretAccessKey)
  const [region, setRegion] = useState(initial.region || 'us-east-1')
  const [prefix, setPrefix] = useState(initial.prefix)
  const [scheduleHours, setScheduleHours] = useState(initial.scheduleHours || 24)
  const [enabled, setEnabled] = useState(initial.enabled)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function body() {
    return {
      endpoint,
      bucket,
      accessKeyId,
      // Send the mask back unchanged when the user didn't retype it → server keeps the stored secret.
      secretAccessKey,
      region,
      prefix,
      scheduleHours,
      enabled,
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/settings/backup/s3', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body()),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setMsg({ kind: 'error', text: data.error ?? 'Save failed.' })
        return
      }
      // After save, the secret is stored — show the mask.
      if (secretAccessKey !== '') setSecretAccessKey(MASK)
      setMsg({ kind: 'ok', text: 'Saved.' })
    } catch {
      setMsg({ kind: 'error', text: 'Save failed.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleTest() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/settings/backup/s3/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body()),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      setMsg(
        data.ok
          ? { kind: 'ok', text: 'Connection OK.' }
          : { kind: 'error', text: data.error ?? 'Connection failed.' },
      )
    } catch {
      setMsg({ kind: 'error', text: 'Connection failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex max-w-md flex-col gap-3">
      <Field label="Endpoint" id="s3-endpoint" value={endpoint} onChange={setEndpoint} />
      <Field label="Bucket" id="s3-bucket" value={bucket} onChange={setBucket} />
      <Field
        label="Access key ID"
        id="s3-access-key"
        value={accessKeyId}
        onChange={setAccessKeyId}
      />
      <Field
        label="Secret access key"
        id="s3-secret"
        type="password"
        value={secretAccessKey}
        onChange={setSecretAccessKey}
      />
      <Field label="Region" id="s3-region" value={region} onChange={setRegion} />
      <Field label="Prefix" id="s3-prefix" value={prefix} onChange={setPrefix} />
      <label className="flex flex-col gap-1 font-medium text-sm">
        Schedule (hours)
        <input
          type="number"
          min={1}
          value={scheduleHours}
          onChange={(e) => setScheduleHours(Number(e.target.value))}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 font-normal text-sm"
        />
      </label>
      <label className="flex items-center gap-2 font-medium text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable scheduled S3 backup
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)] disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={busy}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--paper)] disabled:opacity-60"
        >
          Test connection
        </button>
      </div>
      {msg ? (
        <p
          role={msg.kind === 'error' ? 'alert' : 'status'}
          className="text-sm"
          style={{ color: msg.kind === 'error' ? 'var(--error)' : 'var(--success)' }}
        >
          {msg.text}
        </p>
      ) : null}
    </form>
  )
}

function Field({
  label,
  id,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 font-medium text-sm">
      {label}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 font-normal text-sm"
      />
    </label>
  )
}
