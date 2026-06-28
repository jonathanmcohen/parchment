'use client'

import { type FormEvent, useState } from 'react'

// E — git sync config form. Remote/branch/token/author/schedule + Save / Push now
// / Initialize. Shows last push + last error (non_fast_forward gets a distinct
// callout). The token shows a placeholder if set; clearing it revokes.

export interface GitSyncInitial {
  remoteUrl: string
  branch: string
  authorName: string
  authorEmail: string
  scheduleHours: number
  enabled: boolean
  tokenSet: boolean
  lastPush: { oid: string; at: string } | null
  lastError: { kind: string; at: string; message: string } | null
}

const TOKEN_PLACEHOLDER = '•••'

export function GitSyncForm({ initial }: { initial: GitSyncInitial }) {
  const [remoteUrl, setRemoteUrl] = useState(initial.remoteUrl)
  const [branch, setBranch] = useState(initial.branch || 'main')
  const [token, setToken] = useState(initial.tokenSet ? TOKEN_PLACEHOLDER : '')
  const [authorName, setAuthorName] = useState(initial.authorName || 'Parchment')
  const [authorEmail, setAuthorEmail] = useState(initial.authorEmail || 'parchment@localhost')
  const [scheduleHours, setScheduleHours] = useState(initial.scheduleHours)
  const [enabled, setEnabled] = useState(initial.enabled)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function buildBody() {
    return {
      remoteUrl,
      branch,
      authorName,
      authorEmail,
      scheduleHours,
      enabled,
      // Only send a token when the user changed it away from the placeholder.
      ...(token !== TOKEN_PLACEHOLDER ? { token } : {}),
    }
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/settings/git-sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      })
      setMsg(res.ok ? { kind: 'ok', text: 'Saved.' } : { kind: 'error', text: 'Save failed.' })
    } finally {
      setBusy(false)
    }
  }

  async function action(path: string) {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(path, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        oid?: string
        error?: string
        message?: string
      }
      setMsg(
        res.ok && data.ok
          ? { kind: 'ok', text: data.oid ? `Pushed ${data.oid.slice(0, 8)}.` : 'Pushed.' }
          : { kind: 'error', text: data.message ?? data.error ?? 'Push failed.' },
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="mt-3 flex max-w-md flex-col gap-3">
      <Field label="Remote URL" id="git-remote" value={remoteUrl} onChange={setRemoteUrl} />
      <Field label="Branch" id="git-branch" value={branch} onChange={setBranch} />
      <Field label="Token" id="git-token" type="password" value={token} onChange={setToken} />
      <Field label="Author name" id="git-author" value={authorName} onChange={setAuthorName} />
      <Field label="Author email" id="git-email" value={authorEmail} onChange={setAuthorEmail} />
      <label htmlFor="git-schedule" className="flex flex-col gap-1 font-medium text-sm">
        Schedule
        <select
          id="git-schedule"
          value={scheduleHours}
          onChange={(e) => setScheduleHours(Number(e.target.value))}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 font-normal text-sm"
        >
          <option value={0}>Push on each save</option>
          <option value={1}>Every hour</option>
          <option value={6}>Every 6 hours</option>
          <option value={24}>Every day</option>
          <option value={168}>Every week</option>
        </select>
      </label>
      <label className="flex items-center gap-2 font-medium text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable git sync
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)] disabled:opacity-60"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => action('/api/settings/git-sync/push-now')}
          disabled={busy}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--paper)] disabled:opacity-60"
        >
          Push now
        </button>
        <button
          type="button"
          onClick={() => action('/api/settings/git-sync/init')}
          disabled={busy}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--paper)] disabled:opacity-60"
        >
          Initialize &amp; first push
        </button>
      </div>

      {initial.lastPush ? (
        <p className="text-[var(--muted)] text-xs">
          Last push: {initial.lastPush.oid.slice(0, 8)} at {initial.lastPush.at}
        </p>
      ) : null}
      {initial.lastError ? (
        <div
          className="rounded-md border p-2 text-xs"
          style={{
            borderColor: 'var(--error)',
            color: 'var(--error)',
          }}
        >
          {initial.lastError.kind === 'non_fast_forward'
            ? 'Remote has diverged. Force-push is not available. Resolve manually and re-push.'
            : `Last error (${initial.lastError.kind}): ${initial.lastError.message}`}
        </div>
      ) : null}

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
