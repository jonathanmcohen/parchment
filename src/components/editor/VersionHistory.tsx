'use client'

import type { Editor } from '@tiptap/core'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { DiffLine, UnifiedHunkLine } from '@/lib/docs/version-diff'
import { diffMarkdown, parseUnifiedHunks, unifiedPatch } from '@/lib/docs/version-diff'
import type { Version, VersionSummary } from '@/lib/docs/versions-shared'
import { serializeMarkdown } from '@/lib/markdown/serialize'

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

// ── F4: per-doc disk/git history ────────────────────────────────────────────

interface GitCommit {
  oid: string
  message: string
  timestamp: number
  author: string
}

/** Render a unix-seconds timestamp as a short local date-time. */
function formatGitTime(seconds: number): string {
  try {
    return new Date(seconds * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(seconds)
  }
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
  // F5: unified diff for version A/B comparison
  const [versionPatch, setVersionPatch] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [namedLabel, setNamedLabel] = useState('')
  const [savingNamed, setSavingNamed] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // F5: diff-mode toggle — 'visual' (existing) or 'unified' (new)
  const [diffMode, setDiffMode] = useState<'visual' | 'unified'>('visual')

  // F4: disk/git history (the .md mirror's commit log for this doc).
  const [gitCommits, setGitCommits] = useState<GitCommit[]>([])
  const [gitLoaded, setGitLoaded] = useState(false)
  const [gitSelected, setGitSelected] = useState<string | null>(null)
  const [gitPreview, setGitPreview] = useState<string | null>(null)
  const [gitPreviewLoading, setGitPreviewLoading] = useState(false)
  // F5: unified diff between the selected git commit and the current doc content
  const [gitUnifiedPatch, setGitUnifiedPatch] = useState<string | null>(null)

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

  // ── F4: load disk/git history ────────────────────────────────────────

  const loadGit = useCallback(async () => {
    try {
      const res = await fetch(`/api/docs/${docId}/git-log`)
      if (!res.ok) {
        setGitLoaded(true)
        return
      }
      const rows = (await res.json()) as GitCommit[]
      setGitCommits(rows)
    } catch {
      // disk history is non-critical
    } finally {
      setGitLoaded(true)
    }
  }, [docId])

  useEffect(() => {
    void loadGit()
  }, [loadGit])

  // ── F4: preview a commit's file content (read-only) ──────────────────

  const handleGitSelect = useCallback(
    async (oid: string) => {
      // Toggle off if re-clicking the open commit.
      if (gitSelected === oid) {
        setGitSelected(null)
        setGitPreview(null)
        setGitUnifiedPatch(null)
        return
      }
      setGitSelected(oid)
      setGitPreview(null)
      setGitUnifiedPatch(null)
      setGitPreviewLoading(true)
      try {
        const res = await fetch(`/api/docs/${docId}/git-show?oid=${encodeURIComponent(oid)}`)
        if (!res.ok) {
          setGitPreview(null)
          return
        }
        const body = (await res.json()) as { content: string }
        setGitPreview(body.content)
        // F5: compute unified diff between this commit and the current doc content.
        // Canonical current markdown via the same serializer the autosave + disk
        // mirror use, so the diff vs a commit's stored markdown is apples-to-apples
        // (editor.getText() would be plain text and produce a noisy diff).
        const currentMd: string = serializeMarkdown(editor.getJSON())
        const shortOid = oid.slice(0, 7)
        setGitUnifiedPatch(unifiedPatch(body.content, currentMd, `commit ${shortOid}`, 'current'))
      } catch {
        setGitPreview(null)
        setGitUnifiedPatch(null)
      } finally {
        setGitPreviewLoading(false)
      }
    },
    [docId, gitSelected, editor],
  )

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
      // F5: also compute the unified patch for the unified-diff view
      const labelA = vA.label ?? `v${vA.id.slice(0, 7)}`
      const labelB = vB.label ?? `v${vB.id.slice(0, 7)}`
      setVersionPatch(unifiedPatch(vA.markdown, vB.markdown, labelA, labelB))
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
      setVersionPatch(null)
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
          editor.commands.setContent(
            body.content as Parameters<typeof editor.commands.setContent>[0],
          )
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
                background: isSelected ? 'var(--surface-hover, #F8F9FA)' : 'transparent',
                outline: isSelected ? '2px solid var(--accent)' : 'none',
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
                      background: v.kind === 'named' ? 'var(--accent)' : 'var(--muted-bg, #e5e7eb)',
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

      {/* F5: Diff-mode toggle — shown whenever there is an active diff context */}
      {(selectedA || selectedB || gitSelected) && (
        <fieldset
          style={{
            display: 'flex',
            gap: 4,
            padding: '6px 12px',
            borderTop: '1px solid var(--border, #e5e7eb)',
            border: 'none',
            borderTopWidth: 1,
            borderTopStyle: 'solid',
            borderTopColor: 'var(--border, #e5e7eb)',
            margin: 0,
          }}
          aria-label="Diff display mode"
        >
          <button
            type="button"
            aria-pressed={diffMode === 'visual'}
            onClick={() => setDiffMode('visual')}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 3,
              border: '1px solid var(--border, #e5e7eb)',
              background: diffMode === 'visual' ? 'var(--accent)' : 'transparent',
              color: diffMode === 'visual' ? 'var(--accent-contrast, #fff)' : 'inherit',
              cursor: 'pointer',
              fontWeight: diffMode === 'visual' ? 600 : 400,
            }}
          >
            Visual
          </button>
          <button
            type="button"
            aria-pressed={diffMode === 'unified'}
            onClick={() => setDiffMode('unified')}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 3,
              border: '1px solid var(--border, #e5e7eb)',
              background: diffMode === 'unified' ? 'var(--accent)' : 'transparent',
              color: diffMode === 'unified' ? 'var(--accent-contrast, #fff)' : 'inherit',
              cursor: 'pointer',
              fontWeight: diffMode === 'unified' ? 600 : 400,
            }}
          >
            Unified
          </button>
        </fieldset>
      )}

      {/* F4: Disk history (git) */}
      <section
        aria-label="Disk history (git)"
        style={{ borderTop: '1px solid var(--border, #e5e7eb)', padding: '8px 0' }}
      >
        <div style={{ padding: '0 12px 6px', fontSize: 13, fontWeight: 600 }}>
          Disk history (git)
        </div>
        {!gitLoaded && (
          <p style={{ fontSize: 12, color: 'var(--muted, #6b7280)', padding: '0 12px', margin: 0 }}>
            Loading disk history…
          </p>
        )}
        {gitLoaded && gitCommits.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted, #6b7280)', padding: '0 12px', margin: 0 }}>
            No disk history yet.
          </p>
        )}
        {gitCommits.length > 0 && (
          <ol aria-label="Disk commits" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {gitCommits.map((c) => {
              const shortOid = c.oid.slice(0, 7)
              const isOpen = gitSelected === c.oid
              return (
                <li
                  key={c.oid}
                  style={{
                    borderBottom: '1px solid var(--border, #e5e7eb)',
                    background: isOpen ? 'var(--surface-hover, #F8F9FA)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Preview commit ${shortOid}: ${c.message}`}
                    aria-expanded={isOpen}
                    onClick={() => void handleGitSelect(c.oid)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: '6px 12px',
                      font: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: 11,
                        color: 'var(--muted, #6b7280)',
                      }}
                    >
                      {shortOid}
                    </span>{' '}
                    <span style={{ fontSize: 12 }}>{c.message}</span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--muted, #6b7280)',
                      }}
                    >
                      {formatGitTime(c.timestamp)} · {c.author}
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 12px 8px' }}>
                      {gitPreviewLoading && <p style={{ fontSize: 12, margin: 0 }}>Loading…</p>}
                      {!gitPreviewLoading && gitPreview === null && (
                        <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>
                          Could not load this version.
                        </p>
                      )}
                      {!gitPreviewLoading && gitPreview !== null && diffMode === 'visual' && (
                        <figure aria-label={`Content at commit ${shortOid}`} style={{ margin: 0 }}>
                          <pre
                            style={{
                              margin: 0,
                              padding: 8,
                              fontSize: 11,
                              fontFamily: 'ui-monospace, monospace',
                              background: 'var(--surface-hover, #F8F9FA)',
                              border: '1px solid var(--border, #e5e7eb)',
                              borderRadius: 4,
                              maxHeight: 240,
                              overflow: 'auto',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {gitPreview}
                          </pre>
                        </figure>
                      )}
                      {/* F5: unified diff — commit vs current */}
                      {!gitPreviewLoading && gitPreview !== null && diffMode === 'unified' && (
                        <UnifiedDiffBlock
                          patch={gitUnifiedPatch}
                          label={`Unified diff: commit ${shortOid} vs current`}
                        />
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* Diff view (version A vs B) */}
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

          {/* Visual diff */}
          {diffLines !== null && !diffLoading && diffMode === 'visual' && (
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

          {/* F5: Unified diff */}
          {versionPatch !== null && !diffLoading && diffMode === 'unified' && (
            <div style={{ padding: '0 12px' }}>
              <UnifiedDiffBlock patch={versionPatch} label="Unified diff (A vs B)" />
            </div>
          )}
        </section>
      )}
    </aside>
  )
}

// ── F5: UnifiedDiffBlock ────────────────────────────────────────────────────

/** Shared renderer for a unified-patch string with per-line colouring. */
function UnifiedDiffBlock({ patch, label }: { patch: string | null; label: string }): ReactElement {
  if (patch === null) {
    return <p style={{ fontSize: 12, margin: 0, color: 'var(--muted, #6b7280)' }}>No diff yet.</p>
  }

  const lines: UnifiedHunkLine[] = parseUnifiedHunks(patch)

  return (
    <figure aria-label={label} style={{ margin: 0 }}>
      <pre
        style={{
          margin: 0,
          padding: 8,
          fontSize: 11,
          fontFamily: 'ui-monospace, monospace',
          background: 'var(--surface-hover, #F8F9FA)',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 4,
          maxHeight: 300,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {lines.length === 0 && (
          <span style={{ color: 'var(--muted, #6b7280)' }}>No differences.</span>
        )}
        {lines.map((line, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: unified patch lines have no stable id; index is safe here
            key={i}
            style={{
              background:
                line.kind === 'add'
                  ? 'rgba(34, 197, 94, 0.15)'
                  : line.kind === 'del'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : line.kind === 'hunk'
                      ? 'rgba(59, 130, 246, 0.08)'
                      : 'transparent',
              color:
                line.kind === 'add'
                  ? '#166534'
                  : line.kind === 'del'
                    ? '#991b1b'
                    : line.kind === 'hunk'
                      ? '#1d4ed8'
                      : line.kind === 'meta'
                        ? 'var(--muted, #6b7280)'
                        : 'inherit',
            }}
          >
            {line.text}
          </div>
        ))}
      </pre>
    </figure>
  )
}
