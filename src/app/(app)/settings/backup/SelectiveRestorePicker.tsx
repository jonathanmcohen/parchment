'use client'

import { useRef, useState } from 'react'

// D2 — selective restore picker. Upload a backup zip → dry-run lists its entries
// with per-entry checkboxes (all ON by default). "Restore selected" posts the
// CHECKED titles as a docTitles filter.

interface DryRunEntry {
  title: string
  diskPath: string
  included: boolean
}

export function SelectiveRestorePicker() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<DryRunEntry[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [filterText, setFilterText] = useState('')
  const [counts, setCounts] = useState<{
    wouldCreate: number
    wouldSkip: number
    filtered: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function reset() {
    setEntries([])
    setChecked({})
    setCounts(null)
    setMsg(null)
    setFilterText('')
  }

  async function runDryRun() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setMsg({ kind: 'error', text: 'Choose a backup .zip first.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.set('zip', file)
      const res = await fetch('/api/settings/backup/restore/dry-run', { method: 'POST', body: fd })
      const data = (await res.json().catch(() => ({}))) as {
        entries?: DryRunEntry[]
        wouldCreate?: number
        wouldSkip?: number
        filtered?: number
        error?: string
      }
      if (!res.ok) {
        setMsg({ kind: 'error', text: data.error ?? 'Could not read the backup.' })
        return
      }
      const list = data.entries ?? []
      setEntries(list)
      // All ON by default.
      setChecked(Object.fromEntries(list.map((e) => [e.title, true])))
      setCounts({
        wouldCreate: data.wouldCreate ?? 0,
        wouldSkip: data.wouldSkip ?? 0,
        filtered: data.filtered ?? 0,
      })
    } catch {
      setMsg({ kind: 'error', text: 'Could not read the backup.' })
    } finally {
      setBusy(false)
    }
  }

  async function restoreSelected() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    const docTitles = entries.map((e) => e.title).filter((t) => checked[t])
    setBusy(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.set('zip', file)
      fd.set('filter', JSON.stringify({ docTitles }))
      const res = await fetch('/api/settings/backup/restore', { method: 'POST', body: fd })
      const data = (await res.json().catch(() => ({}))) as { created?: number; error?: string }
      setMsg(
        res.ok
          ? { kind: 'ok', text: `Restored ${data.created ?? 0} document(s).` }
          : { kind: 'error', text: data.error ?? 'Restore failed.' },
      )
    } catch {
      setMsg({ kind: 'error', text: 'Restore failed.' })
    } finally {
      setBusy(false)
    }
  }

  const visible = entries.filter(
    (e) =>
      filterText === '' ||
      e.title.toLowerCase().includes(filterText.toLowerCase()) ||
      e.diskPath.toLowerCase().includes(filterText.toLowerCase()),
  )

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          reset()
        }}
        className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)]"
      >
        Selective restore…
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Selective restore"
          className="mt-3 rounded-md border border-[var(--border)] p-4"
        >
          <h3 className="font-medium text-base">Selective restore</h3>
          <div className="mt-3 flex flex-col gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              aria-label="Backup file"
              className="block w-full text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={runDryRun}
                disabled={busy}
                className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)] disabled:opacity-60"
              >
                Dry run
              </button>
              {entries.length > 0 ? (
                <button
                  type="button"
                  onClick={restoreSelected}
                  disabled={busy}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--paper)] disabled:opacity-60"
                >
                  Restore selected
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-1.5 text-sm hover:bg-[var(--paper)]"
              >
                Cancel
              </button>
            </div>

            {counts ? (
              <p className="text-[var(--muted)] text-sm">
                Would create <strong>{counts.wouldCreate}</strong>, skip{' '}
                <strong>{counts.wouldSkip}</strong>, filtered <strong>{counts.filtered}</strong>.
              </p>
            ) : null}

            {entries.length > 0 ? (
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter documents…"
                aria-label="Filter documents"
                className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-2 py-1.5 text-sm"
              />
            ) : null}

            {/* Table shell is ALWAYS rendered (the column headers are the picker's
                structure); rows appear after a dry run. */}
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="pb-1 font-medium">
                    Include
                  </th>
                  <th scope="col" className="pb-1 font-medium">
                    Document
                  </th>
                  <th scope="col" className="pb-1 font-medium">
                    Path
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-2 text-[var(--muted)]">
                      Upload a backup and run a dry run to list its documents.
                    </td>
                  </tr>
                ) : (
                  visible.map((e) => (
                    <tr key={e.title}>
                      <td className="py-0.5">
                        <input
                          type="checkbox"
                          checked={checked[e.title] ?? true}
                          aria-label={`Include ${e.title}`}
                          onChange={(ev) =>
                            setChecked((c) => ({ ...c, [e.title]: ev.target.checked }))
                          }
                        />
                      </td>
                      <td className="py-0.5">{e.title}</td>
                      <td className="py-0.5 text-[var(--muted)]">{e.diskPath}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {msg ? (
              <p
                role={msg.kind === 'error' ? 'alert' : 'status'}
                className="text-sm"
                style={{ color: msg.kind === 'error' ? 'var(--error)' : 'var(--success)' }}
              >
                {msg.text}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
