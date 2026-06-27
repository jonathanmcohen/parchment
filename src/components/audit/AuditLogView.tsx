'use client'

import { useId, useMemo, useState } from 'react'

export type AuditAction = 'create' | 'delete' | 'share' | 'export' | 'login'

export interface AuditRow {
  id: string
  action: string
  actorId: string | null
  targetType: string | null
  targetId: string | null
  meta: Record<string, unknown> | null
  ip: string | null
  createdAt: Date
}

// Result of verifyAuditChain() (Phase-0 canonical export), surfaced as a banner.
export type AuditIntegrity = { ok: boolean; brokenAt?: string }

const ACTIONS: readonly AuditAction[] = ['create', 'delete', 'share', 'export', 'login']

const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatTime(value: Date): string {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : timeFormat.format(date)
}

function formatTarget(row: AuditRow): string {
  if (!row.targetType && !row.targetId) return '—'
  if (row.targetType && row.targetId) return `${row.targetType} · ${row.targetId}`
  return row.targetType ?? row.targetId ?? '—'
}

function formatDetails(meta: Record<string, unknown> | null): string {
  if (!meta || Object.keys(meta).length === 0) return '—'
  return JSON.stringify(meta)
}

export function AuditLogView({
  rows,
  integrity,
}: {
  rows: AuditRow[]
  integrity?: AuditIntegrity
}) {
  const [filter, setFilter] = useState<'all' | AuditAction>('all')
  const filterId = useId()

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.action === filter)),
    [rows, filter],
  )

  return (
    <div className="mt-6">
      {/* §5.4: tamper-evidence banner — verifyAuditChain re-hashes the chain. */}
      {integrity ? (
        <div
          role="status"
          aria-live="polite"
          className={
            integrity.ok
              ? 'mb-4 rounded-md border border-[var(--success,#16a34a)] bg-[var(--success-bg,#f0fdf4)] px-3 py-2 text-sm text-[var(--success,#16a34a)]'
              : 'mb-4 rounded-md border border-[var(--error,#dc2626)] bg-[var(--error-bg,#fef2f2)] px-3 py-2 text-sm text-[var(--error,#dc2626)]'
          }
        >
          {integrity.ok ? (
            <span>Integrity verified — the audit chain is intact.</span>
          ) : (
            <span>
              Integrity check FAILED — the chain is broken
              {integrity.brokenAt ? ` at entry ${integrity.brokenAt}` : ''}.
            </span>
          )}
        </div>
      ) : null}

      <div className="mb-4 flex items-center gap-2">
        <label htmlFor={filterId} className="text-[var(--muted)] text-sm">
          Filter by action
        </label>
        <select
          id={filterId}
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | AuditAction)}
          className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-2 py-1 text-[var(--foreground)] text-sm"
        >
          <option value="all">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Audit log entries, newest first</caption>
          <thead>
            <tr className="border-[var(--border)] border-b bg-[var(--paper)]">
              <th scope="col" className="px-3 py-2 font-semibold">
                Time
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Action
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Actor
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Target
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                IP
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[var(--muted)]">
                  No audit entries.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.id} className="border-[var(--border)] border-b last:border-b-0">
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">
                    {formatTime(row.createdAt)}
                  </td>
                  <td className="px-3 py-2">{row.action}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{row.actorId ?? '—'}</td>
                  <td className="px-3 py-2">{formatTarget(row)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[var(--muted)] text-xs">
                    {row.ip ?? '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--muted)] text-xs">
                    {formatDetails(row.meta)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
