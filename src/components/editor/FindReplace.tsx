'use client'

import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type FindState, getFindState } from '@/lib/editor/extensions/find-replace'
import type { FindOptions } from '@/lib/editor/find'

// Re-export FindState so consumers don't need to import from the extension module.
export type { FindState }

type Mode = 'find' | 'replace'

type Props = {
  editor: Editor
  initialMode?: Mode
  onClose: () => void
}

export function FindReplace({ editor, initialMode = 'find', onClose }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [scope, setScope] = useState<'doc' | 'selection'>('doc')

  const findInputRef = useRef<HTMLInputElement>(null)

  // Focus find input on open
  useEffect(() => {
    findInputRef.current?.focus()
  }, [])

  // Update mode when prop changes (e.g. Cmd-Shift-H after panel is open)
  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  // Read find state from plugin
  const findState = useEditorState({
    editor,
    selector: ({ editor: ed }) => getFindState(ed.state),
  })

  const matchCount = findState.matches.length
  const activeIndex = findState.activeIndex
  const error = findState.error

  const runFind = useCallback(
    (q: string, cs: boolean, ww: boolean, rx: boolean, sc: 'doc' | 'selection') => {
      const opts: FindOptions & { scope: 'doc' | 'selection' } = {
        scope: sc,
        ...(cs ? { caseSensitive: true } : {}),
        ...(ww ? { wholeWord: true } : {}),
        ...(rx ? { regex: true } : {}),
      }
      editor.commands.setFindQuery(q, opts)
    },
    [editor],
  )

  const handleQueryChange = (q: string) => {
    setQuery(q)
    runFind(q, caseSensitive, wholeWord, useRegex, scope)
  }

  const handleOptionToggle = (option: 'case' | 'word' | 'regex') => {
    const newCs = option === 'case' ? !caseSensitive : caseSensitive
    const newWw = option === 'word' ? !wholeWord : wholeWord
    const newRx = option === 'regex' ? !useRegex : useRegex
    if (option === 'case') setCaseSensitive(newCs)
    if (option === 'word') setWholeWord(newWw)
    if (option === 'regex') setUseRegex(newRx)
    runFind(query, newCs, newWw, newRx, scope)
  }

  const handleScopeChange = (sc: 'doc' | 'selection') => {
    setScope(sc)
    runFind(query, caseSensitive, wholeWord, useRegex, sc)
  }

  const handleClose = () => {
    editor.commands.clearFind()
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      editor.commands.findNext()
    } else if (e.key === 'Enter' && e.shiftKey) {
      editor.commands.findPrev()
    }
  }

  const counterLabel = matchCount === 0 ? 'No matches' : `${activeIndex + 1} of ${matchCount}`

  return (
    <search
      className="parchment-find-panel"
      aria-label="Find and replace"
      onKeyDown={handleKeyDown}
    >
      {/* ── Header row ─────────────────────────────────────────────── */}
      <div className="parchment-find-header">
        <div className="parchment-find-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'find'}
            className="parchment-find-tab"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode('find')}
          >
            Find
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'replace'}
            className="parchment-find-tab"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode('replace')}
          >
            Replace
          </button>
        </div>
        <button
          type="button"
          aria-label="Close find and replace"
          className="parchment-find-close"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClose}
        >
          ✕
        </button>
      </div>

      {/* ── Find row ────────────────────────────────────────────────── */}
      <div className="parchment-find-row">
        <label className="parchment-find-input-wrap">
          <span className="parchment-find-sr-only">Find</span>
          <input
            ref={findInputRef}
            type="text"
            aria-label="Find"
            className="parchment-find-input"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Find…"
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        {/* Options toggle buttons */}
        <button
          type="button"
          aria-label="Case sensitive"
          aria-pressed={caseSensitive}
          className="parchment-find-opt-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleOptionToggle('case')}
          title="Case sensitive"
        >
          Aa
        </button>
        <button
          type="button"
          aria-label="Whole word"
          aria-pressed={wholeWord}
          className="parchment-find-opt-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleOptionToggle('word')}
          title="Whole word"
        >
          W
        </button>
        <button
          type="button"
          aria-label="Use regular expression"
          aria-pressed={useRegex}
          className="parchment-find-opt-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleOptionToggle('regex')}
          title="Regular expression"
        >
          .*
        </button>

        {/* Counter */}
        <span className="parchment-find-counter" aria-live="polite" aria-atomic="true">
          {query ? counterLabel : ''}
        </span>

        {/* Prev / Next */}
        <button
          type="button"
          aria-label="Previous match"
          className="parchment-find-nav-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.commands.findPrev()}
          disabled={matchCount === 0}
        >
          ▲
        </button>
        <button
          type="button"
          aria-label="Next match"
          className="parchment-find-nav-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.commands.findNext()}
          disabled={matchCount === 0}
        >
          ▼
        </button>
      </div>

      {/* ── Replace row (only in replace mode) ────────────────────── */}
      {mode === 'replace' && (
        <div className="parchment-find-row">
          <label className="parchment-find-input-wrap">
            <span className="parchment-find-sr-only">Replace with</span>
            <input
              type="text"
              aria-label="Replace with"
              className="parchment-find-input"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="Replace with…"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            aria-label="Replace current match"
            className="parchment-find-action-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.commands.replaceCurrent(replacement)}
            disabled={matchCount === 0}
          >
            Replace
          </button>
          <button
            type="button"
            aria-label="Replace all matches"
            className="parchment-find-action-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.commands.replaceAll(replacement)}
            disabled={matchCount === 0}
          >
            Replace all
          </button>
        </div>
      )}

      {/* ── Scope selector ──────────────────────────────────────────── */}
      <div className="parchment-find-row parchment-find-row--scope">
        <label className="parchment-find-scope-label" htmlFor="find-scope">
          Scope
        </label>
        <select
          id="find-scope"
          aria-label="Search scope"
          className="parchment-find-scope-select"
          value={scope}
          onChange={(e) => handleScopeChange(e.target.value as 'doc' | 'selection')}
        >
          <option value="doc">Document</option>
          <option value="selection">Selection</option>
        </select>
      </div>

      {/* ── Regex error ────────────────────────────────────────────── */}
      {error && (
        <div className="parchment-find-error" role="alert">
          Invalid regex: {error}
        </div>
      )}
    </search>
  )
}
