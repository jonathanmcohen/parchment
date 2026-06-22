'use client'

// I2 Part 3 — Vim markdown source mode.
//
// Swaps the WYSIWYG editor for a CodeMirror 6 editor with Vim keybindings,
// editing the document as canonical Markdown. The CodeMirror + vim modules are
// dynamically imported INSIDE this component (never statically) so they are NOT
// bundled into the main editor chunk — they load only when source mode is first
// opened.
//
// ROUND-TRIP: on mount we serialize the current PM-JSON → markdown via the real
// disk-mirror serializer (serializeMarkdown). On exit we parse the edited text
// back → PM-JSON via the real markdownToJson, and hand it to onExit so the host
// editor replaces its content in a single transaction.
//
// FIDELITY: the round-trip is markdown-lossy for nodes markdown cannot express
// (diagrams, some embeds collapse to fenced `parchment:` blocks, footnoteRefs do
// not round-trip — see parse.ts). A persistent one-line warning makes this
// explicit before the user commits edits.
//
// COLLAB SAFETY: see the comment at the toggle call-site in Editor.tsx. Source
// mode operates on a serialized SNAPSHOT, not the live Y.Doc. Applying the
// result is a single wholesale content replace; to avoid clobbering concurrent
// remote edits, source mode is gated to the solo / non-collaborating case at the
// call site (GAP-logged). This component itself never touches the Y.Doc.

import { useEffect, useId, useRef, useState } from 'react'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

type Props = {
  /** Current document content as ProseMirror JSON. */
  json: Record<string, unknown>
  /** Called with the re-parsed PM-JSON when the user leaves source mode. */
  onExit: (updatedJson: Record<string, unknown>) => void
}

// Minimal shape of a CodeMirror EditorView we rely on (avoids a static type
// import that would pull the module into the main bundle's type graph).
interface CmView {
  state: { doc: { toString(): string } }
  focus(): void
  destroy(): void
}

export function SourceMode({ json, onExit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<CmView | null>(null)
  const [vimMode, setVimMode] = useState<string>('NORMAL')
  const [ready, setReady] = useState(false)
  const statusId = useId()

  // onExit may change identity; read the latest via a ref so the mount effect
  // can stay []-scoped (CodeMirror is created exactly once).
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const jsonRef = useRef(json)
  jsonRef.current = json

  // Mount CodeMirror once. Dynamic import keeps the modules out of the main chunk.
  useEffect(() => {
    let cancelled = false
    let view: CmView | null = null

    async function mount() {
      const [{ EditorView, basicSetup }, { markdown }, vimMod] = await Promise.all([
        import('codemirror'),
        import('@codemirror/lang-markdown'),
        import('@replit/codemirror-vim'),
      ])
      if (cancelled || !hostRef.current) return

      const initialDoc = serializeMarkdown(jsonRef.current)

      const realView = new EditorView({
        doc: initialDoc,
        extensions: [
          // vim() must come first so its keymap takes precedence (per docs).
          vimMod.vim(),
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
        ],
        parent: hostRef.current,
      })
      view = realView as unknown as CmView
      viewRef.current = view

      // Reflect Vim mode (NORMAL/INSERT/VISUAL) in the indicator when exposed.
      try {
        const cm = vimMod.getCM(realView)
        if (cm) {
          vimMod.Vim.defineEx?.('', '', () => {})
          cm.on?.('vim-mode-change', (e: { mode?: string }) => {
            if (!cancelled && e.mode) setVimMode(e.mode.toUpperCase())
          })
        }
      } catch {
        // Mode introspection is best-effort; the static "Vim source mode" label
        // remains accurate even if the live indicator is unavailable.
      }

      realView.focus()
      if (!cancelled) setReady(true)
    }

    void mount()

    return () => {
      cancelled = true
      view?.destroy()
      viewRef.current = null
    }
  }, [])

  function handleDone() {
    const view = viewRef.current
    if (!view) {
      // Modules never finished loading — exit without changes rather than throw.
      onExitRef.current(jsonRef.current)
      return
    }
    const text = view.state.doc.toString()
    const updated = markdownToJson(text)
    onExitRef.current(updated)
  }

  return (
    <section className="parchment-source-mode" aria-label="Markdown source editor (Vim)">
      <div
        className="flex items-center justify-between gap-3 border-[var(--border)] border-b px-3 py-2"
        style={{ background: 'var(--paper)' }}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">Vim source mode</span>
          <span
            id={statusId}
            aria-live="polite"
            className="rounded bg-[var(--background)] px-1.5 py-0.5 font-mono text-[var(--muted)] text-xs"
          >
            {ready ? vimMode : 'loading…'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleDone}
          className="rounded-md bg-[var(--accent-contrast)] px-3 py-1.5 font-medium text-sm text-white"
        >
          Done
        </button>
      </div>

      <p className="px-3 py-1.5 text-[var(--muted)] text-xs" role="note">
        You are editing canonical Markdown. Content that Markdown cannot represent (some diagrams
        and embeds) may change on save.
      </p>

      {/* CodeMirror mounts here. */}
      <div ref={hostRef} className="parchment-source-cm" />
    </section>
  )
}
