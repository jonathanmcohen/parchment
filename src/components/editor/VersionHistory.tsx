'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useState } from 'react'
import type { DiffLine } from '@/lib/docs/version-diff'
import { diffMarkdown } from '@/lib/docs/version-diff'
import type { Version, VersionSummary } from '@/lib/docs/versions-shared'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function versionLabel(v: VersionSummary): string {
  if (v.label) return v.label
  return `Autosave • ${formatTime(v.createdAt)}`
}

// ── VersionHistory ─────────────────────────────────────────────────────────

interface Props {
  docId: string
  editor: Editor
}

export function VersionHistory({ docId, editor }: Props) {
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [selectedA, setSelectedA] = useState<string | null>(null)
  const [selectedB, setSelectedB] = useState<string | null>(null)
  const [diffLines, setDiffLines] = useState<DiffLine[] | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [namedLabel, setNamedLabel] = useState('')
  const [savingNamed, setSavingNamed] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Load versions ────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/docs/${docId}/versions`)
      if (!res.ok) return
      const rows = (await res.json()) as VersionSummary[]
      setVersions(rows)
    } catch {
      // sidebar is non-critical
    }
  }, [docId])

  useEffect(() => {
    void load()
  }, [load])

  // ── Diff two versions ────────────────────────────────────────────────

  const computeDiff = useCallback(async () => {
    if (!selectedA || !selectedB) return
    setDiffLoading(true)
    setError(null)
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/docs/${docId}/versions/${selectedA}`),
        fetch(`/api/docs/${docId}/versions/${selectedB}`),
      ])
      if (!resA.ok || !resB.ok) {
        setError('Failed to load versions for diff.')
        return
      }
      const vA = (await resA.json()) as Version
      const vB = (await resB.json()) as Version
      setDiffLines(diffMarkdown(vA.markdown, vB.markdown))
    } catch {
      setError('Diff failed.')
    } finally {
      setDiffLoading(false)
    }
  }, [docId, selectedA, selectedB])

  useEffect(() => {
    if (selectedA && selectedB) {
      void computeDiff()
    } else {
      setDiffLines(null)
    }
  }, [selectedA, selectedB, computeDiff])

  // ── Save named version ───────────────────────────────────────────────

  const handleSaveNamed = useCallback(async () => {
    const label = namedLabel.trim()
    if (!label) return
    setSavingNamed(true)
    setError(null)
    try {
      const res = await fetch(`/api/docs/${docId}/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'named', label }),
      })
      if (!res.ok) {
        setError('Failed to save named version.')
        return
      }
      setNamedLabel('')
      await load()
    } catch {
      setError('Failed to save named version.')
    } finally {
      setSavingNamed(false)
    }
  }, [docId, namedLabel, load])

  // ── Restore ──────────────────────────────────────────────────────────

  const handleRestore = useCallback(
    async (versionId: string, label: string) => {
      const confirmed = window.confirm(
        `Restore to "${label}"? The current state will be saved as a snapshot first so you can undo this.`,
      )
      if (!confirmed) return
      setRestoring(versionId)
      setError(null)
      try {
        const res = await fetch(`/api/docs/${docId}/versions/${versionId}/restore`, {
          method: 'POST',
        })
        if (!res.ok) {
          setError('Restore failed.')
          return
        }
        const body = (await res.json()) as { content: unknown; markdown: string }
        // Update the editor content in-place with the restored JSON
        if (body.content && typeof body.content === 'object') {
          editor.commands.setContent(body.content as Parameters<typeof editor.commands.setContent>[0])
        }
        await load()
      } catch {
        setError('Restore failed.')
      } finally {
        setRestoring(null)
      }
    },
    [docId, editor, load],
  )

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <aside
      aria-label="Version history"
      style={{
        width: 300,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border, #e5e7eb)',
        background: 'var(--surface, #fff)',
        overflowY: 'auto',
        padding: '8px 0',
        maxHeight: '100vh',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px 8px',
          borderBottom: '1px solid var(--border, #e5e7eb)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>Version History</span>
      </div>

      {/* Save named version */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border, #e5e7eb)',
          display: 'flex',
          gap: 6,
        }}
      >
        <input
          type="text"
          aria-label="Named version label"
          placeholder="Name this version…"
          value={namedLabel}
          onChange={(e) => setNamedLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSaveNamed()
          }}
          style={{ flex: 1, fontSize: 12, boxSizing: 'border-box' }}
        />
        <button
          type="button"
          aria-label="Save named version"
          disabled={savingNamed || namedLabel.trim().length === 0}
          onClick={() => void handleSaveNamed()}
          style={{ fontSize: 12, padding: '2px 8px' }}
        >
          Save
        </button>
      </div>

      {/* Diff instructions */}
      {versions.length >= 2 && (
        <p
          style={{ fontSize: 11, color: 'var(--muted, #6b7280)', padding: '6px 12px 0', margin: 0 }}
        >
          Select two versions to compare.
        </p>
      )}

      {/* Error */}
      {error && (
        <p role="alert" style={{ fontSize: 12, color: '#dc2626', padding: '4px 12px', margin: 0 }}>
          {error}
        </p>
      )}

      {/* Version list */}
      <ol
        aria-label="Versions"
        style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, overflowY: 'auto' }}
      >
        {versions.length === 0 && (
          <li style={{ fontSize: 13, color: 'var(--muted, #6b7280)', padding: '12px' }}>
            No versions yet.
          </li>
        )}
        {versions.map((v) => {
          const label = versionLabel(v)
          const isA = selectedA === v.id
          const isB = selectedB === v.id
          const isSelected = isA || isB

          return (
            <li
              key={v.id}
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--border, #e5e7eb)',
                background: isSelected ? 'var(--surface-hover, #f9fafb)' : 'transparent',
                outline: isSelected ? '2px solid var(--accent, #7c3aed)' : 'none',
                outlineOffset: -2,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 4,
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}
                >
                  {/* Kind badge */}
                  <span
                    title={v.kind === 'named' ? 'Named snapshot' : 'Autosave'}
                    style={{
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 3,
                      background:
                        v.kind === 'named' ? 'var(--accent, #7c3aed)' : 'var(--muted-bg, #e5e7eb)',
                      color:
                        v.kind === 'named'
                          ? 'var(--accent-contrast, #fff)'
                          : 'var(--muted, #6b7280)',
                      flexShrink: 0,
                      fontWeight: 600,
                    }}
                  >
                    {v.kind === 'named' ? 'Named' : 'Auto'}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={label}
                  >
                    {label}
                  </span>
                </div>

                {/* Select for diff */}
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  <button
                    type="button"
                    aria-label={`Select ${label} as version A for diff`}
                    aria-pressed={isA}
                    onClick={() => setSelectedA(isA ? null : v.id)}
                    style={{
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 3,
                      border: '1px solid var(--border, #e5e7eb)',
                      background: isA ? '#22c55e' : 'transparent',
                      color: isA ? '#fff' : 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    A
                  </button>
                  <button
                    type="button"
                    aria-label={`Select ${label} as version B for diff`}
                    aria-pressed={isB}
                    onClick={() => setSelectedB(isB ? null : v.id)}
                    style={{
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 3,
                      border: '1px solid var(--border, #e5e7eb)',
                      background: isB ? '#3b82f6' : 'transparent',
                      color: isB ? '#fff' : 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    aria-label={`Restore to ${label}`}
                    disabled={restoring === v.id}
                    onClick={() => void handleRestore(v.id, label)}
                    style={{
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 3,
                      border: '1px solid var(--border, #e5e7eb)',
                      background: 'transparent',
                      cursor: restoring === v.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {restoring === v.id ? '…' : 'Restore'}
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {/* Diff view */}
      {(selectedA || selectedB) && (
        <section
          aria-label="Version diff"
          style={{
            borderTop: '1px solid var(--border, #e5e7eb)',
            padding: '8px 0',
          }}
        >
          <div
            style={{
              padding: '0 12px 6px',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              gap: 8,
            }}
          >
            <span style={{ color: '#22c55e' }}>A</span>
            <span>vs</span>
            <span style={{ color: '#3b82f6' }}>B</span>
            {(!selectedA || !selectedB) && (
              <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 400 }}>(select both)</span>
            )}
          </div>

          {diffLoading && (
            <p style={{ fontSize: 12, padding: '0 12px', margin: 0 }}>Loading diff…</p>
          )}

          {diffLines !== null && !diffLoading && (
            <section
              aria-label="Markdown diff"
              style={{
                margin: 0,
                padding: '0 12px',
                fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {diffLines.length === 0 && (
                <span style={{ color: 'var(--muted, #6b7280)' }}>Versions are identical.</span>
              )}
              {diffLines.map((line, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no stable id; index is safe here
                  key={i}
                  style={{
                    background:
                      line.type === 'add'
                        ? 'rgba(34, 197, 94, 0.15)'
                        : line.type === 'del'
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'transparent',
                    color:
                      line.type === 'add' ? '#166534' : line.type === 'del' ? '#991b1b' : 'inherit',
                    paddingLeft: 4,
                  }}
                >
                  {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                  {line.text}
                </div>
              ))}
            </section>
          )}
        </section>
      )}
    </aside>
  )
}
