'use client'

import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import type { CrossRefTarget, RefKind } from '@/lib/editor/cross-ref'
import { crossRefNumberingKey } from '@/lib/editor/extensions/cross-ref-numbering'

type Props = {
  editor: Editor
  onPick: (targetId: string, kind: RefKind) => void
  onClose: () => void
}

/**
 * G8b: CrossRefPicker — a minimal dropdown listing all cross-ref targets in the
 * document (from the crossRefNumbering plugin map), grouped by kind. Selecting a
 * target calls onPick(targetId, kind) so the caller can insertCrossRef.
 *
 * Positioning: floats below the current selection using getBoundingClientRect on
 * the PM view's DOM selection. Falls back to top-left if no selection rect is
 * available. Closes on Escape or click outside.
 */
export function CrossRefPicker({ editor, onPick, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Collect targets from the live numbering plugin state. Subscribe via
  // useEditorState so the list re-renders whenever any target in the document
  // changes while the picker is open (e.g. a new figure inserted in a collab
  // session). This is the G7 lesson — reading plugin state once at render goes
  // stale; useEditorState subscribes to ALL transactions (same fix as CrossRefView).
  const targets: CrossRefTarget[] =
    useEditorState({
      editor,
      selector: ({ editor: e }) => {
        const numbering = crossRefNumberingKey.getState(e.view.state)
        if (!numbering) return []
        return Array.from(numbering.values())
      },
    }) ?? []

  // Sort targets: by kind order then by number.
  const KIND_ORDER: RefKind[] = ['figure', 'table', 'equation', 'heading']
  targets.sort((a, b) => {
    const ki = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    if (ki !== 0) return ki
    return a.number - b.number
  })

  // Group by kind
  const groups: Record<string, CrossRefTarget[]> = {}
  for (const t of targets) {
    if (!groups[t.kind]) groups[t.kind] = []
    // biome-ignore lint/style/noNonNullAssertion: assigned in preceding line
    groups[t.kind]!.push(t)
  }

  // Position: try to place the picker below the selection caret.
  // coordsAtPos returns viewport-relative coords. We use position:'fixed' so
  // we can apply them directly without adding scroll offsets or subtracting any
  // positioned ancestor's offset (G8b-fix: previous 'absolute' + scrollY/scrollX
  // overshot whenever a positioned ancestor was present in the tree).
  const { from } = editor.state.selection
  let top = 100
  let left = 100
  try {
    const coords = editor.view.coordsAtPos(from)
    top = coords.bottom + 4
    left = coords.left
  } catch {
    // fallback to defaults
  }

  // Close on click outside.
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  // Close on Escape.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [onClose])

  const kindLabel: Record<RefKind, string> = {
    figure: 'Figures',
    table: 'Tables',
    equation: 'Equations',
    heading: 'Sections',
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Cross-reference picker"
      className="parchment-crossref-picker"
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 9999,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        minWidth: 220,
        maxWidth: 340,
        maxHeight: 360,
        overflowY: 'auto',
        padding: '4px 0',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {targets.length === 0 ? (
        <div
          style={{
            padding: '8px 12px',
            color: 'var(--muted)',
            fontStyle: 'italic',
            fontSize: 13,
          }}
        >
          No cross-reference targets in this document.
        </div>
      ) : (
        KIND_ORDER.filter((k) => groups[k]?.length).map((kind) => (
          <div key={kind}>
            <div
              style={{
                padding: '4px 12px 2px',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--muted)',
              }}
            >
              {kindLabel[kind]}
            </div>
            {(groups[kind] ?? []).map((t) => (
              <button
                key={t.refId}
                type="button"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '5px 12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPick(t.refId, t.kind)
                }}
              >
                <span style={{ fontWeight: 500 }}>{t.label}</span>
                {t.caption ? (
                  <span
                    style={{
                      marginLeft: 6,
                      color: 'var(--muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 180,
                      display: 'inline-block',
                      verticalAlign: 'bottom',
                    }}
                  >
                    — {t.caption}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
