'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getGrammarMatches, type PositionedMatch } from '@/lib/editor/extensions/grammar-check'
import type { Match } from '@/lib/integrations/dictionary'

type Props = {
  editor: Editor
  onClose: () => void
}

type Status = 'idle' | 'loading' | 'error' | 'done'

/** Max characters of editor text sent per check — mirrors the server cap. */
const CLIENT_INPUT_CAP = 20_000

/**
 * K7: grammar-check panel (right rail). Runs LanguageTool over the current doc
 * text via the server proxy, decorates the matches in the editor, and lists each
 * match with replacement chips + an "Add to dictionary" action. Rendered ONLY
 * when LanguageTool is enabled server-side (the parent gates on grammarEnabled),
 * so a disabled instance never shows this UI and never calls the endpoint.
 */
export function GrammarPanel({ editor, onClose }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [positioned, setPositioned] = useState<PositionedMatch[]>([])
  const reqIdRef = useRef(0)

  const runCheck = useCallback(async () => {
    // The doc's plain text — the block separator MUST match buildTextMap in the
    // grammar-check extension (single '\n' between blocks) so LanguageTool
    // offsets map back to the right ProseMirror positions.
    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n')
    if (text.trim().length === 0) {
      editor.commands.clearGrammarMatches()
      setPositioned([])
      setStatus('done')
      return
    }

    const myReq = ++reqIdRef.current
    setStatus('loading')
    try {
      const res = await fetch('/api/grammar/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, CLIENT_INPUT_CAP), locale: 'en-US' }),
      })
      // A stale response from an earlier click is ignored.
      if (myReq !== reqIdRef.current) return
      if (!res.ok) {
        setStatus('error')
        return
      }
      const data = (await res.json()) as { matches?: Match[] }
      const matches = Array.isArray(data.matches) ? data.matches : []
      editor.commands.setGrammarMatches(matches)
      setPositioned(getGrammarMatches(editor.state))
      setStatus('done')
    } catch {
      if (myReq !== reqIdRef.current) return
      setStatus('error')
    }
  }, [editor])

  // Run an initial check when the panel opens; clear decorations on unmount.
  useEffect(() => {
    void runCheck()
    return () => {
      editor.commands.clearGrammarMatches()
    }
  }, [runCheck, editor])

  // Keep the listed match positions in sync as the doc changes (the extension
  // remaps decorations; we re-read positions so "apply" targets stay correct).
  useEffect(() => {
    const refresh = () => setPositioned(getGrammarMatches(editor.state))
    editor.on('transaction', refresh)
    return () => {
      editor.off('transaction', refresh)
    }
  }, [editor])

  const applyReplacement = useCallback(
    (pm: PositionedMatch, replacement: string) => {
      editor.chain().focus().insertContentAt({ from: pm.from, to: pm.to }, replacement).run()
      // The transaction handler refreshes positions; drop this match from the list.
      setPositioned((cur) => cur.filter((p) => p !== pm))
    },
    [editor],
  )

  const addToDictionary = useCallback(
    async (word: string) => {
      try {
        await fetch('/api/dictionary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word }),
        })
      } catch {
        // Non-fatal — re-check below will simply still show the word.
      }
      // Re-run the check so the now-dictionaried word is filtered out server-side.
      await runCheck()
    },
    [runCheck],
  )

  return (
    <aside
      aria-label="Grammar suggestions"
      className="ml-3 w-72 shrink-0 rounded-md border border-[var(--border)] bg-[var(--paper)] p-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-sm">Grammar &amp; style</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close grammar panel"
          className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[var(--muted)] text-xs hover:bg-[var(--background)]"
        >
          Close
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={status === 'loading'}
          className="rounded-md bg-[var(--primary)] px-2.5 py-1 font-medium text-[var(--on-primary)] text-xs disabled:opacity-60"
        >
          {status === 'loading' ? 'Checking…' : 'Re-check'}
        </button>
        <span aria-live="polite" className="text-[var(--muted)] text-xs">
          {status === 'done' &&
            (positioned.length === 0
              ? 'No issues found'
              : `${positioned.length} issue${positioned.length === 1 ? '' : 's'}`)}
          {status === 'error' && 'Check failed, try again'}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {positioned.map((pm, i) => {
          const word = editor.state.doc.textBetween(pm.from, pm.to, ' ')
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: matches have no stable id; index + offset is adequate for this transient list
              key={`${pm.match.offset}-${pm.match.rule.id}-${i}`}
              className="rounded-md border border-[var(--border)] p-2"
            >
              <p className="text-sm">{pm.match.message}</p>
              {word && (
                <p className="mt-0.5 text-[var(--muted)] text-xs">
                  Flagged: <span className="font-mono">{word}</span>
                </p>
              )}
              {pm.match.replacements.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {pm.match.replacements.map((rep) => (
                    <button
                      key={rep}
                      type="button"
                      onClick={() => applyReplacement(pm, rep)}
                      className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--background)]"
                    >
                      {rep}
                    </button>
                  ))}
                </div>
              )}
              {word && (
                <button
                  type="button"
                  onClick={() => void addToDictionary(word)}
                  className="mt-1.5 text-[var(--accent)] text-xs underline"
                >
                  Add “{word}” to dictionary
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
