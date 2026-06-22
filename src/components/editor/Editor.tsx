'use client'

import { HocuspocusProvider } from '@hocuspocus/provider'
import { getSchema } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { NodeSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prosemirrorJSONToYDoc } from 'y-prosemirror'
import * as Y from 'yjs'
import { BacklinksPanel } from '@/components/editor/BacklinksPanel'
import { BubbleMenu } from '@/components/editor/BubbleMenu'
import { CommentsSidebar } from '@/components/editor/CommentsSidebar'
import { CropDialog } from '@/components/editor/CropDialog'
import { FindReplace } from '@/components/editor/FindReplace'
import { ImageDialog } from '@/components/editor/ImageDialog'
import { LinkPopover } from '@/components/editor/LinkPopover'
import { MathPopover } from '@/components/editor/MathPopover'
import { OutlinePane } from '@/components/editor/OutlinePane'
import { PageCanvas } from '@/components/editor/PageCanvas'
import { PageSetupDialog } from '@/components/editor/PageSetupDialog'
import { ReadingPresence } from '@/components/editor/ReadingPresence'
import { SectionBreakDialog } from '@/components/editor/SectionBreakDialog'
import { ShareDialog } from '@/components/editor/ShareDialog'
import { StatusBar } from '@/components/editor/StatusBar'
import { SuggestionsPanel } from '@/components/editor/SuggestionsPanel'
import { Toolbar } from '@/components/editor/Toolbar'
import { VersionHistory } from '@/components/editor/VersionHistory'
import { type Counts, countText } from '@/lib/editor/counts'
import { FindReplaceExtension } from '@/lib/editor/extensions/find-replace'
import { SlashMenuExtension } from '@/lib/editor/extensions/slash-menu'
import { WikiSuggestionExtension } from '@/lib/editor/extensions/wiki-suggestion'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '@/lib/editor/paginate'
import { type Reader, throttle } from '@/lib/editor/reading-presence'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'
import { authorColor } from '@/lib/editor/track-changes'
import { serializeMarkdown } from '@/lib/markdown/serialize'

// Public collab URL — falls back to localhost in dev when env var is absent.
const COLLAB_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_COLLAB_URL) || 'ws://localhost:1234'

type Props = {
  docId: string
  initialTitle: string
  initialJson: Record<string, unknown> | null
  /** D4: current authenticated user — threaded from the server component. */
  currentUserName: string
  currentUserId: string
  /**
   * D4: true when the collab server already holds a persisted Yjs snapshot for
   * this doc. Authoritative gate for first-open seeding — when true the client
   * never seeds from initialJson (the server state wins), eliminating the
   * onSynced-timing race that duplicated content.
   */
  hasCollabState: boolean
}

const FIELD = 'default'

// B0 editor island. Bound to a Y.Doc via Collaboration so Plan D drops in the
// Hocuspocus network provider with no rework. For single-user v0.1 the Y.Doc is
// seeded from the stored ProseMirror JSON and autosave persists JSON + markdown.
// D4: HocuspocusProvider syncs the Y.Doc to the collab server in real-time.
export function Editor({
  docId,
  initialTitle,
  initialJson,
  currentUserName,
  currentUserId,
  hasCollabState,
}: Props) {
  // The Y.Doc is created empty — we do NOT eagerly seed it here (D4). Seeding is
  // gated on `hasCollabState` (a server-rendered fact, not a live fragment check)
  // to avoid the onSynced timing race that duplicated content:
  //   • hasCollabState === true  → the collab server is authoritative; the client
  //     NEVER seeds. Content arrives over the wire on sync.
  //   • hasCollabState === false → never-collaborated doc; the client seeds from
  //     initialJson once, either on first sync (server confirmed empty) or via the
  //     offline fallback when the server is unreachable.
  // Empty deps [] is correct: Y.Doc is created once on mount.
  const ydoc = useMemo(() => new Y.Doc(), [])

  // `hasCollabState` captured in a ref so the provider's (mount-stable) callbacks
  // read it without re-creating the provider.
  const hasCollabStateRef = useRef(hasCollabState)
  hasCollabStateRef.current = hasCollabState

  // D4: Track whether we have already seeded the Y.Doc so no path applies
  // initialJson twice.
  const seededRef = useRef(false)

  // D4: the offline-fallback timer, hoisted to a ref so unmount can clear it if
  // the component goes away before the timeout fires.
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Seed the Y.Doc from initialJson. Two modes:
   *   • online (force=false): only seed a never-collaborated doc (hasCollabState
   *     === false). The collab server is authoritative when it has a snapshot, so
   *     seeding on top of it would duplicate content.
   *   • offline (force=true): the collab server is unreachable — seed regardless
   *     of hasCollabState so the editor shows the last-mirrored content from
   *     `documents.content`. The caller disconnects the provider in this path so
   *     the local seed never merges with server state on a later reconnect.
   * Both modes keep the fragment-empty guard (two-tab race) and seededRef
   * idempotency.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: initialJson and ydoc are stable per mount.
  const seedFromInitial = useCallback((opts?: { force?: boolean }) => {
    if (seededRef.current || !initialJson) return
    // Online path: server holds an authoritative snapshot — never seed on top.
    if (!opts?.force && hasCollabStateRef.current) {
      seededRef.current = true
      return
    }
    // Guard against a peer that already seeded this fragment (two-tab race).
    const xmlFrag = ydoc.get(FIELD, Y.XmlFragment)
    if (xmlFrag.length > 0) {
      seededRef.current = true
      return
    }
    const schema = getSchema(baseExtensions)
    const seeded = prosemirrorJSONToYDoc(schema, initialJson, FIELD)
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seeded))
    seededRef.current = true
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // D4: HocuspocusProvider — wires the Y.Doc to the collab WebSocket server.
  //
  // RESILIENCE: The provider is created synchronously in useMemo (not in
  // useEffect) so that CollaborationCaret — which requires a provider at
  // configure time — can receive it before useEditor runs. Creation is wrapped
  // in try/catch: if it throws (bad URL, missing module, SSR leak) we fall back
  // to null and seed the doc immediately so the editor works offline.
  //
  // Seed-once contract (seeding decision is owned by seedFromInitial):
  //   • provider syncs → seedFromInitial() (online, gated on hasCollabState).
  //   • connection closes or hangs before first sync → the editor is offline:
  //     seedFromInitial({force:true}) shows the mirrored content AND we
  //     disconnect() so the local seed can never merge with server state on a
  //     later reconnect (which would duplicate content).
  //   • provider creation fails → force-seed immediately; there is no socket.
  //   • seededRef guards against double-seeding across all paths.
  //
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally stable — docId and ydoc don't change after mount.
  const provider = useMemo<HocuspocusProvider | null>(() => {
    let settled = false
    // After this many ms with no sync, assume the collab server is unreachable
    // and fall back to offline mode so the editor is never stuck empty.
    const OFFLINE_FALLBACK_MS = 4000
    try {
      // `p` is referenced inside the callbacks below; it is assigned before any
      // of them can fire (they are async socket events).
      let p: HocuspocusProvider
      const clearOfflineTimer = () => {
        if (offlineTimerRef.current) {
          clearTimeout(offlineTimerRef.current)
          offlineTimerRef.current = null
        }
      }
      const goOffline = () => {
        if (settled) return
        settled = true
        clearOfflineTimer()
        seedFromInitial({ force: true })
        // Stop reconnect attempts: a reconnect would merge this offline seed with
        // any authoritative server state and duplicate content.
        try {
          p.disconnect()
        } catch {
          // ignore — provider may not have an open socket yet
        }
      }
      offlineTimerRef.current = setTimeout(goOffline, OFFLINE_FALLBACK_MS)
      p = new HocuspocusProvider({
        url: COLLAB_URL,
        name: docId,
        document: ydoc,
        onSynced: () => {
          if (settled) return
          settled = true
          clearOfflineTimer()
          // Online: gated seed — only a never-collaborated doc is seeded here.
          seedFromInitial()
        },
        onClose: ({ event }) => {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[parchment-collab] connection closed', event)
          }
          // Closed before first sync → offline fallback.
          goOffline()
        },
        onStatus: ({ status }) => {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[parchment-collab] status:', status)
          }
        },
      })
      return p
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[parchment-collab] provider creation failed, running offline:', err)
      }
      // No socket exists — force-seed so the editor has content.
      seedFromInitial({ force: true })
      return null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Destroy the provider on unmount; also clear the offline-fallback timer so it
  // can't fire goOffline() after the component is gone.
  useEffect(() => {
    return () => {
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current)
        offlineTimerRef.current = null
      }
      try {
        provider?.destroy()
      } catch {
        // Ignore errors on unmount.
      }
    }
  }, [provider])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pageSetup, setPageSetup] = useState<PageSetup>(DEFAULT_PAGE_SETUP)
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const [pageCount, setPageCount] = useState(1)

  // B5: image dialog state — null = closed; string = prefill src for paste/drop flow
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [imageDialogPrefillSrc, setImageDialogPrefillSrc] = useState<string | undefined>(undefined)

  // B6: link popover state
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
  const openLinkPopover = useCallback(() => setLinkPopoverOpen(true), [])
  const closeLinkPopover = useCallback(() => setLinkPopoverOpen(false), [])

  // B9: find + replace panel state
  const [findOpen, setFindOpen] = useState(false)
  const [findMode, setFindMode] = useState<'find' | 'replace'>('find')
  const openFind = useCallback((mode: 'find' | 'replace') => {
    setFindMode(mode)
    setFindOpen(true)
  }, [])
  const closeFind = useCallback(() => setFindOpen(false), [])

  const openImageDialog = useCallback((prefillSrc?: string) => {
    setImageDialogPrefillSrc(prefillSrc)
    setImageDialogOpen(true)
  }, [])

  const closeImageDialog = useCallback(() => {
    setImageDialogOpen(false)
    setImageDialogPrefillSrc(undefined)
  }, [])

  // B5 crop: selected-image crop dialog state (pos + attrs captured at open time)
  const [cropState, setCropState] = useState<null | {
    src: string
    alt: string
    pos: number
    attrs: Record<string, unknown>
  }>(null)

  // B13: section-break edit dialog — holds the doc position of the node to edit.
  const [sectionDialogPos, setSectionDialogPos] = useState<number | null>(null)

  // G4: math editor popover — holds the doc position + current LaTeX of the math
  // node being edited (null = closed). Opened from the slash menu (new empty
  // node) and from clicking an existing math node (parchment:edit-math event).
  const [mathEdit, setMathEdit] = useState<{ pos: number; latex: string } | null>(null)
  const openMathEditor = useCallback((pos: number) => {
    setMathEdit({ pos, latex: '' })
  }, [])

  // D1: comments sidebar toggle
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false)

  // D3: version history panel toggle
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)

  // D2: suggestions panel toggle
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

  // F6: backlinks panel toggle
  const [backlinksOpen, setBacklinksOpen] = useState(false)

  // G1: share-management dialog toggle
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  // D5: reading presence readers list + canvas wrapper ref
  const [readers, setReaders] = useState<Reader[]>([])
  const canvasWrapRef = useRef<HTMLDivElement>(null)

  const save = useCallback(
    (json: Record<string, unknown>) => {
      const markdown = serializeMarkdown(json)
      void fetch(`/api/docs/${docId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentJson: json, markdown }),
      })
    },
    [docId],
  )

  // Upload a File to the assets route and return the resulting URL.
  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      const form = new FormData()
      form.append('file', file)
      try {
        const res = await fetch(`/api/docs/${docId}/assets`, { method: 'POST', body: form })
        if (!res.ok) return null
        const body = (await res.json()) as { url: string }
        return body.url
      } catch {
        return null
      }
    },
    [docId],
  )

  // D4: cursor color is deterministic and stable — derive once from the user id.
  const cursorColor = useMemo(() => authorColor(currentUserId), [currentUserId])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...baseExtensions,
      Collaboration.configure({ document: ydoc, field: FIELD }),
      // D4: CollaborationCaret renders remote cursors + name labels.
      // Only added when provider is available (creation may fail if collab
      // server is unreachable at startup — the editor still works offline).
      ...(provider
        ? [
            CollaborationCaret.configure({
              provider,
              user: { name: currentUserName, color: cursorColor },
            }),
          ]
        : []),
      // B9: configured with onOpen so Cmd-F / Cmd-Shift-H open the React panel.
      FindReplaceExtension.configure({ onOpen: openFind }),
      // B12: slash menu — onOpenImage delegates to the existing image dialog.
      // G4: onEditMath opens the LaTeX popover for a freshly-inserted math node.
      SlashMenuExtension.configure({ onOpenImage: openImageDialog, onEditMath: openMathEditor }),
      // F6: [[ autocomplete — drives the React WikiSuggestionMenu popup. Wired
      // here (not baseExtensions) so its ReactRenderer popup only loads client-side.
      WikiSuggestionExtension,
    ],
    editorProps: {
      attributes: { class: 'parchment-prose', 'aria-label': 'Document editor' },
      // B5: handle image paste and drop
      handleDOMEvents: {
        paste: (_view, event) => {
          const items = event.clipboardData?.items
          if (!items) return false
          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (item?.type.startsWith('image/')) {
              const file = item.getAsFile()
              if (!file) continue
              event.preventDefault()
              // Upload first, then open dialog with pre-filled src so user supplies alt
              void uploadFile(file).then((url) => {
                if (url) openImageDialog(url)
              })
              return true
            }
          }
          return false
        },
        drop: (_view, event) => {
          const files = event.dataTransfer?.files
          if (!files || files.length === 0) return false
          let handled = false
          for (let i = 0; i < files.length; i++) {
            const file = files[i]
            if (file?.type.startsWith('image/')) {
              event.preventDefault()
              handled = true
              void uploadFile(file).then((url) => {
                if (url) openImageDialog(url)
              })
              break // only handle first image file per drop for simplicity
            }
          }
          return handled
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => save(ed.getJSON() as Record<string, unknown>), 800)
    },
  })

  // D3: autosave snapshot — tracks the last-snapshotted markdown to avoid spamming.
  // Only fires a version snapshot when the content has changed since last snapshot.
  // Declared after useEditor so `editor` is in scope.
  const lastSnapshotMd = useRef<string | null>(null)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!editor) return
      const json = editor.getJSON() as Record<string, unknown>
      const md = serializeMarkdown(json)
      // Skip if content hasn't changed since last snapshot
      if (md === lastSnapshotMd.current) return
      lastSnapshotMd.current = md
      void fetch(`/api/docs/${docId}/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'auto' }),
      })
    }, 30_000)
    return () => clearInterval(interval)
  }, [docId, editor])

  // B10: derive full-document and selection counts reactively via useEditorState.
  // The selector runs on every transaction so counts stay in sync with edits and
  // selection changes without extra state variables.
  const counts = useEditorState({
    editor,
    selector: (ctx): { full: Counts; selection: Counts | null } => {
      if (!ctx.editor) return { full: { words: 0, chars: 0 }, selection: null }
      const full = countText(ctx.editor.getText())
      const { from, to } = ctx.editor.state.selection
      const selectionText = from === to ? null : ctx.editor.state.doc.textBetween(from, to, ' ')
      const selection = selectionText !== null ? countText(selectionText) : null
      return { full, selection }
    },
  })

  const full: Counts = counts?.full ?? { words: 0, chars: 0 }
  const selection: Counts | null = counts?.selection ?? null

  const openCropForSelection = useCallback(() => {
    if (!editor) return
    const sel = editor.state.selection
    if (!(sel instanceof NodeSelection)) return
    const node = sel.node
    if (node.type.name !== 'image') return
    const src = node.attrs.src as string | null
    if (!src) return
    setCropState({
      src,
      alt: (node.attrs.alt as string | null) ?? '',
      pos: sel.from,
      attrs: node.attrs,
    })
  }, [editor])

  const applyCrop = useCallback(
    (url: string) => {
      if (!editor || !cropState) return
      const { pos, attrs } = cropState
      editor.commands.command(({ tr, dispatch }) => {
        if (dispatch) {
          tr.setNodeMarkup(pos, undefined, { ...attrs, src: url, width: null, height: null })
        }
        return true
      })
      setCropState(null)
    },
    [editor, cropState],
  )

  // Overlay crop button (image NodeView) dispatches this DOM event.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = () => openCropForSelection()
    dom.addEventListener('parchment:crop-image', handler)
    return () => dom.removeEventListener('parchment:crop-image', handler)
  }, [editor, openCropForSelection])

  // B13: section-break NodeView "Edit section" button dispatches this DOM event.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = (e: Event) => {
      const pos = (e as CustomEvent<{ pos: number }>).detail?.pos
      if (typeof pos === 'number') setSectionDialogPos(pos)
    }
    dom.addEventListener('parchment:edit-section', handler)
    return () => dom.removeEventListener('parchment:edit-section', handler)
  }, [editor])

  // G4: math NodeViews dispatch parchment:edit-math {pos, latex} on click — open
  // the LaTeX popover seeded with the clicked node's current source.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pos: number; latex: string }>).detail
      if (detail && typeof detail.pos === 'number') {
        setMathEdit({ pos: detail.pos, latex: detail.latex ?? '' })
      }
    }
    dom.addEventListener('parchment:edit-math', handler)
    return () => dom.removeEventListener('parchment:edit-math', handler)
  }, [editor])

  // D5: publish own awareness presence + reading position
  useEffect(() => {
    if (!editor || !provider) return

    // Publish user field so unfocused readers still appear in awareness
    provider.setAwarenessField('user', { name: currentUserName, color: cursorColor })

    const publishReading = throttle(() => {
      try {
        // Probe the doc position at the centre of the editor's *visible* band
        // (clamped to the viewport), not the raw window centre — the editor is
        // offset below the toolbar/title, and short docs don't reach mid-window.
        const rect = editor.view.dom.getBoundingClientRect()
        const visTop = Math.max(rect.top, 0)
        const visBottom = Math.min(rect.bottom, window.innerHeight)
        const midY = (visTop + visBottom) / 2
        const x = rect.left + Math.min(40, rect.width / 2)
        const hit = editor.view.posAtCoords({ left: x, top: midY })
        if (hit) {
          provider.setAwarenessField('reading', { pos: hit.pos, updatedAt: Date.now() })
        }
      } catch {
        // editor may be transiently invalid
      }
    }, 200)

    // Initial publish
    publishReading()

    const onScroll = () => publishReading()
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    editor.on('update', publishReading)

    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      editor.off('update', publishReading)
      publishReading.cancel()
    }
  }, [editor, provider, currentUserName, cursorColor])

  return (
    <div className="mx-auto max-w-5xl">
      {/* Inline formatting toolbar (B2) */}
      {editor && (
        <Toolbar
          editor={editor}
          docId={docId}
          onInsertImage={openImageDialog}
          onOpenLink={openLinkPopover}
          onCropImage={openCropForSelection}
          onOpenPageSetup={() => setPageSetupOpen(true)}
          onToggleComments={() => setCommentsSidebarOpen((v) => !v)}
          commentsSidebarOpen={commentsSidebarOpen}
          onToggleVersionHistory={() => setVersionHistoryOpen((v) => !v)}
          versionHistoryOpen={versionHistoryOpen}
          onToggleSuggestions={() => setSuggestionsOpen((v) => !v)}
          suggestionsOpen={suggestionsOpen}
          onToggleBacklinks={() => setBacklinksOpen((v) => !v)}
          backlinksOpen={backlinksOpen}
          onOpenShare={() => setShareDialogOpen(true)}
        />
      )}

      <h1 className="mb-4 font-semibold text-2xl tracking-tight">{initialTitle}</h1>

      {/* B11: outline rail + canvas in a flex row; D1: comments sidebar on the right */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
        {/* B11: outline pane (left rail) */}
        {editor && <OutlinePane editor={editor} />}

        {/* B9: find + replace panel — positioned relative to this wrapper */}
        <div ref={canvasWrapRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <PageCanvas pageSetup={pageSetup} onPageCountChange={setPageCount} editor={editor}>
            <EditorContent editor={editor} />
          </PageCanvas>

          {editor && findOpen && (
            <FindReplace editor={editor} initialMode={findMode} onClose={closeFind} />
          )}

          {editor && provider && (
            <ReadingPresence
              editor={editor}
              provider={provider}
              containerRef={canvasWrapRef}
              onReadersChange={setReaders}
            />
          )}
        </div>

        {/* D1: comments sidebar (right rail) */}
        {editor && commentsSidebarOpen && <CommentsSidebar docId={docId} editor={editor} />}

        {/* D3: version history panel (right rail) */}
        {editor && versionHistoryOpen && <VersionHistory docId={docId} editor={editor} />}

        {/* D2: suggestions panel (right rail) */}
        {editor && suggestionsOpen && <SuggestionsPanel editor={editor} />}

        {/* F6: backlinks panel (right rail) */}
        {editor && backlinksOpen && <BacklinksPanel docId={docId} />}
      </div>

      {/* Selection bubble menu (B2) */}
      {editor && <BubbleMenu editor={editor} />}

      <StatusBar
        pageCount={pageCount}
        full={full}
        selection={selection}
        readers={readers.map((r) => r.user)}
      />

      {/* B5: Image insert dialog */}
      {editor && imageDialogOpen && (
        <ImageDialog
          editor={editor}
          docId={docId}
          {...(imageDialogPrefillSrc !== undefined ? { prefillSrc: imageDialogPrefillSrc } : {})}
          onClose={closeImageDialog}
        />
      )}

      {/* B6: Link popover */}
      {editor && linkPopoverOpen && <LinkPopover editor={editor} onClose={closeLinkPopover} />}

      {/* G4: Math editor popover */}
      {editor && mathEdit !== null && (
        <MathPopover
          editor={editor}
          pos={mathEdit.pos}
          initialLatex={mathEdit.latex}
          onClose={() => setMathEdit(null)}
        />
      )}

      {/* B13: section-break edit dialog */}
      {editor && sectionDialogPos !== null && (
        <SectionBreakDialog
          editor={editor}
          pos={sectionDialogPos}
          onClose={() => setSectionDialogPos(null)}
        />
      )}

      {/* B5: Image crop dialog (selected image) */}
      {editor && cropState && (
        <CropDialog
          docId={docId}
          src={cropState.src}
          alt={cropState.alt}
          onCropped={applyCrop}
          onClose={() => setCropState(null)}
        />
      )}

      {/* B14: Page setup dialog */}
      {pageSetupOpen && (
        <PageSetupDialog
          initial={pageSetup}
          onApply={setPageSetup}
          onClose={() => setPageSetupOpen(false)}
        />
      )}

      {/* G1: Share dialog */}
      {shareDialogOpen && <ShareDialog docId={docId} onClose={() => setShareDialogOpen(false)} />}
    </div>
  )
}
