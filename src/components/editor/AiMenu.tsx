'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useRef, useState } from 'react'
import { authorColor } from '@/lib/editor/track-changes'

type AiOperation = 'improve' | 'shorten' | 'translate' | 'continue'

type Props = {
  editor: Editor
  aiEnabled: boolean
}

type AiStatus = 'idle' | 'loading' | 'error_disabled' | 'error_failed'

const OPERATIONS: { op: AiOperation; label: string }[] = [
  { op: 'improve', label: 'Improve' },
  { op: 'shorten', label: 'Shorten' },
  { op: 'translate', label: 'Translate…' },
  { op: 'continue', label: 'Continue' },
]

export function AiMenu({ editor, aiEnabled }: Props) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<AiStatus>('idle')
  const [showLangInput, setShowLangInput] = useState(false)
  const [targetLang, setTargetLang] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const langInputRef = useRef<HTMLInputElement>(null)

  const runOperation = useCallback(
    async (op: AiOperation, lang?: string) => {
      // Capture selection at click time — used only for the fetch body.
      // We re-read positions from editor.state after the await to avoid
      // stale-position corruption (the user may type during network latency).
      const clickFrom = editor.state.selection.from
      const clickTo = editor.state.selection.to
      if (clickFrom === clickTo) return

      const text = editor.state.doc.textBetween(clickFrom, clickTo, ' ')
      if (!text.trim()) return

      setOpen(false)
      setShowLangInput(false)
      setStatus('loading')

      // Capture suggesting state before the async work so we can restore it
      // in the finally block regardless of success or error.
      const wasOn = editor.storage.suggesting?.enabled ?? false

      try {
        const res = await fetch('/api/ai/compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: op, text, ...(lang ? { targetLang: lang } : {}) }),
        })

        if (res.status === 503) {
          setStatus('error_disabled')
          return
        }

        if (!res.ok) {
          setStatus('error_failed')
          return
        }

        const data = (await res.json()) as { result?: string }
        const result = data.result
        if (!result) {
          setStatus('error_failed')
          return
        }

        // ── Re-read positions after the async round-trip ────────────────────
        // The document may have changed while the fetch was in-flight (user
        // typed, Yjs sync, etc.). ProseMirror positions are absolute integers
        // and are NOT remapped automatically — using clickFrom/clickTo here
        // would corrupt the document.  Clamp to the current document size so
        // we never pass an out-of-bounds position to insertContentAt.
        const docSize = editor.state.doc.content.size
        const from = Math.min(clickFrom, docSize)
        const to = Math.min(clickTo, docSize)

        // Enable suggesting so AI output is tracked as suggestions.
        editor.commands.setSuggesting(true)

        if (op === 'continue') {
          // Append AI result after the selection end (or the remapped end).
          editor.chain().focus().insertContentAt(to, result).run()
        } else {
          // Replace ops (improve / shorten / translate):
          //
          // appendTransaction in suggesting.ts marks ONLY net-positive
          // insertions (delta > 0) and ignores programmatic range deletions.
          // This means a plain insertContentAt({from,to}, result) would:
          //   • silently delete the original text (no deletion mark), AND
          //   • only mark the excess tail bytes (if result is longer).
          //
          // Fix: apply the deletion mark to [from, to] ourselves FIRST, then
          // insert `result` at `from` so appendTransaction sees a pure
          // insertion and marks it correctly as an insertion suggestion.
          // Together they form a reviewable tracked replace: old text is
          // struck-through (deletion), new text is underlined (insertion).
          const deletionMarkType = editor.state.schema.marks.deletion
          const author: string = (editor.storage.suggesting?.author as string | undefined) ?? 'You'
          const color = authorColor(author)

          if (deletionMarkType && from < to) {
            // Step 1: mark the original range as a tracked deletion.
            editor
              .chain()
              .focus()
              .command(({ tr }) => {
                tr.addMark(from, to, deletionMarkType.create({ author, color }))
                return true
              })
              .run()
          }

          // Step 2: insert new text at `from` (suggesting ON → appendTransaction
          // marks it as an insertion).  insertContentAt with a single position
          // inserts without deleting the marked-deleted range.
          editor.chain().focus().insertContentAt(from, result).run()
        }

        setStatus('idle')
      } catch {
        setStatus('error_failed')
      } finally {
        // Always restore suggesting to its pre-operation state so a thrown
        // error or early return never leaves suggesting stuck ON.
        if (!wasOn) {
          editor.commands.setSuggesting(false)
        }
      }
    },
    [editor],
  )

  const handleOpClick = useCallback(
    (op: AiOperation) => {
      if (op === 'translate') {
        setOpen(false)
        setShowLangInput(true)
        // Focus the lang input after render
        setTimeout(() => langInputRef.current?.focus(), 0)
        return
      }
      void runOperation(op)
    },
    [runOperation],
  )

  const handleLangSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const lang = targetLang.trim()
      if (!lang) return
      setTargetLang('')
      void runOperation('translate', lang)
    },
    [targetLang, runOperation],
  )

  if (!aiEnabled) return null

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* AI trigger button */}
      <button
        type="button"
        aria-label="AI actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="parchment-bubble-btn"
        disabled={status === 'loading'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setShowLangInput(false)
          setStatus('idle')
          setOpen((v) => !v)
        }}
      >
        {status === 'loading' ? '…' : '✦ AI'}
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="AI operations"
          className="parchment-ai-menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 50,
            background: 'var(--color-surface, #fff)',
            border: '1px solid var(--color-border, #e5e7eb)',
            borderRadius: 6,
            padding: '4px 0',
            minWidth: 140,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          }}
        >
          {OPERATIONS.map(({ op, label }) => (
            <button
              key={op}
              type="button"
              role="menuitem"
              className="parchment-ai-menu-item"
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 14px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleOpClick(op)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Translate language input */}
      {showLangInput && (
        <form
          onSubmit={handleLangSubmit}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 50,
            background: 'var(--color-surface, #fff)',
            border: '1px solid var(--color-border, #e5e7eb)',
            borderRadius: 6,
            padding: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            display: 'flex',
            gap: 4,
          }}
        >
          <input
            ref={langInputRef}
            type="text"
            aria-label="Target language"
            placeholder="Language…"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            style={{
              fontSize: '0.875rem',
              padding: '2px 6px',
              width: 120,
              borderRadius: 4,
              border: '1px solid #d1d5db',
            }}
          />
          <button type="submit" className="parchment-bubble-btn" style={{ fontSize: '0.75rem' }}>
            Go
          </button>
        </form>
      )}

      {/* Status messages — aria-live so screen readers announce them */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          left: 0,
          top: '100%',
          zIndex: 50,
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
        }}
      >
        {status === 'loading' && (
          <span
            className="parchment-sr-only"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
            }}
          >
            AI request in progress…
          </span>
        )}
        {status === 'error_disabled' && (
          <span
            style={{ color: 'var(--color-muted, #6b7280)', padding: '4px 8px', display: 'block' }}
          >
            AI is not configured
          </span>
        )}
        {status === 'error_failed' && (
          <span
            style={{ color: 'var(--color-error, #dc2626)', padding: '4px 8px', display: 'block' }}
          >
            AI request failed, try again
          </span>
        )}
      </div>
    </div>
  )
}
