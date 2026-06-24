'use client'

import { useCallback, useEffect, useState } from 'react'

// Client island for the Developer settings "Webhooks" section. All secret
// handling is server-side: the signing secret is shown EXACTLY ONCE in the
// create response and never re-fetched; the list only ever shows a mask. This
// component never imports @/db and never sees an existing webhook's secret.

const EVENT_OPTIONS = [
  { id: 'document.saved', label: 'Document saved' },
  { id: 'document.published', label: 'Document published' },
  { id: 'comment.created', label: 'Comment created' },
] as const

const KIND_OPTIONS = [
  { id: 'generic', label: 'Generic (HMAC-signed)' },
  { id: 'slack', label: 'Slack' },
  { id: 'discord', label: 'Discord' },
] as const

type WebhookKind = (typeof KIND_OPTIONS)[number]['id']
type WebhookEventId = (typeof EVENT_OPTIONS)[number]['id']

type Webhook = {
  id: string
  url: string
  kind: WebhookKind
  events: WebhookEventId[]
  active: boolean
  secretMask: string
  createdAt: string
}

type CreatedWebhook = Webhook & { secret: string }

export function WebhooksManager() {
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The freshly-created webhook's one-time secret (generic). Cleared on refresh.
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null)
  const [testResult, setTestResult] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    const res = await fetch('/api/webhooks')
    const data = res.ok ? ((await res.json()) as { webhooks: Webhook[] }) : { webhooks: [] }
    setWebhooks(data.webhooks)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(
    async (url: string, kind: WebhookKind, events: WebhookEventId[]) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch('/api/webhooks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url, kind, events }),
        })
        if (!res.ok) {
          setError('Could not create the webhook. Check the URL and selected events.')
          return false
        }
        const created = (await res.json()) as CreatedWebhook
        // Generic webhooks need the secret to verify the HMAC; show it once.
        if (created.kind === 'generic') {
          setNewSecret({ id: created.id, secret: created.secret })
        }
        await refresh()
        return true
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  async function remove(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' })
      if (res.ok) {
        if (newSecret?.id === id) setNewSecret(null)
        await refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  async function toggle(id: string, active: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      if (res.ok) await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function sendTest(id: string) {
    setTestResult((r) => ({ ...r, [id]: 'Sending…' }))
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, { method: 'POST' })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; status?: number } | null
      setTestResult((r) => ({
        ...r,
        [id]: data?.ok ? 'Delivered ✓' : `Failed${data?.status ? ` (${data.status})` : ''}`,
      }))
    } catch {
      setTestResult((r) => ({ ...r, [id]: 'Failed' }))
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <NewWebhookForm onCreate={create} busy={busy} />

      <PresetButtons onCreate={create} busy={busy} />

      {newSecret ? (
        <div className="rounded-md border border-[var(--accent)] border-dashed p-3">
          <p className="font-medium text-sm">Signing secret — save it now</p>
          <p className="text-[var(--muted)] text-xs">
            Use this to verify the <code>X-Parchment-Signature</code> header on incoming requests.
            It is shown only this once.
          </p>
          <code className="mt-2 block break-all font-mono text-sm">{newSecret.secret}</code>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-[var(--accent)] text-sm">
          {error}
        </p>
      ) : null}

      {webhooks && webhooks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {webhooks.map((w) => (
            <li key={w.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono">{w.url}</p>
                  <p className="mt-1 text-[var(--muted)] text-xs">
                    {w.kind} · {w.events.join(', ')} · {w.active ? 'active' : 'paused'}
                  </p>
                  {testResult[w.id] ? (
                    <p className="mt-1 text-[var(--muted)] text-xs">{testResult[w.id]}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => sendTest(w.id)}
                    disabled={busy}
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs disabled:opacity-60"
                  >
                    Send test
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(w.id, !w.active)}
                    disabled={busy}
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs disabled:opacity-60"
                  >
                    {w.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(w.id)}
                    disabled={busy}
                    className="text-[var(--muted)] underline-offset-2 hover:underline disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[var(--muted)] text-sm">
          No webhooks yet. Add one above, or use a preset to share to a channel.
        </p>
      )}
    </div>
  )
}

function NewWebhookForm({
  onCreate,
  busy,
}: {
  onCreate: (url: string, kind: WebhookKind, events: WebhookEventId[]) => Promise<boolean>
  busy: boolean
}) {
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<WebhookKind>('generic')
  const [events, setEvents] = useState<WebhookEventId[]>(['document.saved'])

  function toggleEvent(id: WebhookEventId) {
    setEvents((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (url.trim().length === 0 || events.length === 0) return
    const ok = await onCreate(url.trim(), kind, events)
    if (ok) {
      setUrl('')
      setEvents(['document.saved'])
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-[var(--border)] p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="webhook-url" className="font-medium text-sm">
          Payload URL
        </label>
        <input
          id="webhook-url"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/hook"
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-sm"
        />
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <label htmlFor="webhook-kind" className="font-medium text-sm">
          Kind
        </label>
        <select
          id="webhook-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as WebhookKind)}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-sm"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="mt-3">
        <legend className="font-medium text-sm">Events</legend>
        <div className="mt-1 flex flex-col gap-1">
          {EVENT_OPTIONS.map((ev) => (
            <label key={ev.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={events.includes(ev.id)}
                onChange={() => toggleEvent(ev.id)}
              />
              {ev.label}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={busy || url.trim().length === 0 || events.length === 0}
        className="mt-3 rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm text-[var(--on-primary)] disabled:opacity-60"
      >
        Add webhook
      </button>
    </form>
  )
}

// J4: one-click presets that register a Slack/Discord webhook for a common
// channel notification. The owner pastes the incoming-webhook URL; the preset
// fixes the kind + event.
function PresetButtons({
  onCreate,
  busy,
}: {
  onCreate: (url: string, kind: WebhookKind, events: WebhookEventId[]) => Promise<boolean>
  busy: boolean
}) {
  async function preset(kind: 'slack' | 'discord', event: WebhookEventId, prompt: string) {
    const url = window.prompt(prompt)
    if (!url) return
    await onCreate(url.trim(), kind, [event])
  }

  return (
    <div className="rounded-lg border border-[var(--border)] border-dashed p-3">
      <p className="font-medium text-sm">Presets</p>
      <p className="text-[var(--muted)] text-xs">
        Post to a chat channel without configuring signing.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            preset(
              'slack',
              'document.published',
              'Paste your Slack incoming-webhook URL to share published docs:',
            )
          }
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-60"
        >
          Share to Slack channel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            preset(
              'discord',
              'document.published',
              'Paste your Discord webhook URL to share published docs:',
            )
          }
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-60"
        >
          Share to Discord channel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            preset(
              'slack',
              'comment.created',
              'Paste your Slack incoming-webhook URL to be notified on new comments:',
            )
          }
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-60"
        >
          Notify on comment (Slack)
        </button>
      </div>
    </div>
  )
}
