'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useRef, useState } from 'react'

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
      const { from, to } = editor.state.selection
      if (from === to) return

      const text = editor.state.doc.textBetween(from, to, ' ')
      if (!text.trim()) return

      setOpen(false)
      setShowLangInput(false)
      setStatus('loading')

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

        // Capture current suggesting state — restore it after AI inserts
        const wasOn = editor.storage.suggesting?.enabled ?? false

        // Enable suggesting mode so AI output is tracked as suggestions
        editor.commands.setSuggesting(true)

        if (op === 'continue') {
          // Append result at the end of the selection
          editor.chain().focus().insertContentAt(to, result).run()
        } else {
          // Replace the selection with the AI result (tracked: old text gets
          // deletion mark, new text gets insertion mark)
          editor.chain().focus().insertContentAt({ from, to }, result).run()
        }

        // Restore prior suggesting state (leave the tracked changes in place)
        if (!wasOn) {
          editor.commands.setSuggesting(false)
        }

        setStatus('idle')
      } catch {
        setStatus('error_failed')
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
