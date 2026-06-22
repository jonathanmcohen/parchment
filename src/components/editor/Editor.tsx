'use client'

import { HocuspocusProvider } from '@hocuspocus/provider'
import { getSchema } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { NodeSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IndexeddbPersistence } from 'y-indexeddb'
import { prosemirrorJSONToYDoc } from 'y-prosemirror'
import * as Y from 'yjs'
import { BacklinksPanel } from '@/components/editor/BacklinksPanel'
import { BubbleMenu } from '@/components/editor/BubbleMenu'
import { CommentsSidebar } from '@/components/editor/CommentsSidebar'
import { CropDialog } from '@/components/editor/CropDialog'
import { CrossRefPicker } from '@/components/editor/CrossRefPicker'
import { DrawioModal } from '@/components/editor/DrawioModal'
import { FindReplace } from '@/components/editor/FindReplace'
import { ImageDialog } from '@/components/editor/ImageDialog'
import { LinkPopover } from '@/components/editor/LinkPopover'
import { MathPopover } from '@/components/editor/MathPopover'
import { MermaidPopover } from '@/components/editor/MermaidPopover'
import { OfflineIndicator } from '@/components/editor/OfflineIndicator'
import { OutlinePane } from '@/components/editor/OutlinePane'
import { PageCanvas } from '@/components/editor/PageCanvas'
import { PageSetupDialog } from '@/components/editor/PageSetupDialog'
import { PlantumlPopover } from '@/components/editor/PlantumlPopover'
import { PresenterView } from '@/components/editor/PresenterView'
import { ReadingPresence } from '@/components/editor/ReadingPresence'
import { ReadingView } from '@/components/editor/ReadingView'
import { SectionBreakDialog } from '@/components/editor/SectionBreakDialog'
import { ShareDialog } from '@/components/editor/ShareDialog'
import { StatusBar } from '@/components/editor/StatusBar'
import { SuggestionsPanel } from '@/components/editor/SuggestionsPanel'
import { Toolbar } from '@/components/editor/Toolbar'
import { VersionHistory } from '@/components/editor/VersionHistory'
import { WatermarkDialog } from '@/components/editor/WatermarkDialog'
import { type Counts, countText } from '@/lib/editor/counts'
import { CiteSuggestionExtension } from '@/lib/editor/extensions/cite-suggestion'
import { FindReplaceExtension } from '@/lib/editor/extensions/find-replace'
import { SlashMenuExtension } from '@/lib/editor/extensions/slash-menu'
import { WikiSuggestionExtension } from '@/lib/editor/extensions/wiki-suggestion'
import { classifySwipe, isMobileWidth, pageFitScale } from '@/lib/editor/page-fit'
import { DEFAULT_PAGE_SETUP, type PageSetup, resolvePageDims } from '@/lib/editor/paginate'
import { type Reader, throttle } from '@/lib/editor/reading-presence'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'
import { authorColor } from '@/lib/editor/track-changes'
import { DEFAULT_WATERMARK, type WatermarkConfig } from '@/lib/editor/watermark'
import { serializeMarkdown } from '@/lib/markdown/serialize'

// G5: DrawingModal is dynamic-imported so the Excalidraw CSS (imported at the
// top of DrawingModal.tsx) is NOT pulled into the Editor chunk on every page
// load — it is only fetched when a drawing modal is first opened.
const DrawingModal = dynamic(
  () => import('@/components/editor/DrawingModal').then((m) => m.DrawingModal),
  { ssr: false },
)

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
  /** G9: doc-level watermark parsed from documents.meta.watermark on the server. */
  initialWatermark?: WatermarkConfig
  /** G13: true when AI_BASE_URL is configured server-side. Never derived client-side. */
  aiEnabled?: boolean
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
  initialWatermark,
  aiEnabled = false,
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

  // G11: IndexedDB persistence — wires onto the ydoc so edits made offline are
  // durably stored locally and survive page reloads without a server round-trip.
  //
  // Seeding interaction (footgun #3):
  //   The IndexeddbPersistence loads stored updates from IDB and applies them to
  //   the ydoc asynchronously. The provider syncs server state and merges via CRDT.
  //   The seed-from-initialJson gate is extended with a THIRD condition:
  //
  //     Seed only when ALL of:
  //       1. hasCollabState === false   (server has no persisted snapshot)
  //       2. IDB fragment is empty      (this browser has never edited this doc)
  //       3. Server-synced fragment is empty (two-tab race guard, pre-existing)
  //
  //   If IDB already holds content (condition 2 fails), the user is returning to
  //   a previously-edited doc — IDB state is the source of truth and we must NOT
  //   overlay initialJson on top (that would be a duplication event identical to
  //   the D4 race). The Hocuspocus provider CRDT-merges IDB + server state when
  //   it reconnects — this is idempotent and safe.
  //
  //   Implementation: we track whether IDB has finished syncing and whether the
  //   IDB-loaded fragment had content. `idbSyncedRef` becomes true once IDB fires
  //   its 'synced' event; `idbHadContentRef` records the fragment state AT that
  //   moment (before the provider syncs). seedFromInitial reads both refs.
  //
  // Created in useMemo (not useEffect) so it is available before the provider
  // mounts and before useEditor runs. Keyed by docId so each document gets an
  // independent IDB store. Destroyed on unmount via the cleanup effect below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally stable — docId and ydoc don't change after mount.
  const idb = useMemo(() => {
    if (typeof window === 'undefined') return null
    return new IndexeddbPersistence(`parchment-doc-${docId}`, ydoc)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Tracks whether IDB has finished loading its updates into the ydoc.
  const idbSyncedRef = useRef(false)
  // Tracks whether the IDB-loaded fragment had content when 'synced' fired.
  // If true, the IDB already has content → do NOT seed from initialJson.
  const idbHadContentRef = useRef(false)
  // Latches a force=true intent across an IDB deferral. If goOffline (offline
  // fallback) calls seedFromInitial({force:true}) BEFORE IDB has synced, the call
  // defers; the IDB 'synced' handler must then resolve it with force=true (not the
  // plain force=false call, which would hit the hasCollabState early-return and
  // never seed — leaving a doc-with-collab-state empty when the server is down).
  const deferredForceRef = useRef(false)

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
   * Both modes keep the fragment-empty guard (two-tab race), the IDB-had-content
   * guard (G11), and seededRef idempotency.
   *
   * G11 — IDB ordering guarantee (footgun #3 re-entrance prevention):
   *
   *   IndexedDB loading is async. If the provider's onSynced (or the offline
   *   goOffline timer) fires before IDB has finished applying stored updates,
   *   idbHadContentRef.current is still false AND the ydoc fragment is still
   *   empty — all guards pass and seedFromInitial would write initialJson in.
   *   When IDB then fires 'synced' and applies its stored updates on top of the
   *   already-seeded ydoc, content is duplicated (identical to the D4 race).
   *
   *   Fix: gate FIRST on idbSyncedRef.current. If IDB has not yet reported
   *   'synced', return WITHOUT setting seededRef — leaving the door open for the
   *   IDB 'synced' handler to call seedFromInitial() itself once loading is done.
   *   The 'synced' handler always calls seedFromInitial() after setting both refs,
   *   so this is never a dead end. The only exception is when idb is null (SSR /
   *   no window), in which case we skip this gate and proceed normally.
   *
   *   Only skip the IDB guard (idbHadContentRef check) is never omitted — even
   *   the force=true offline path must not overlay IDB content with initialJson.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: idb, initialJson, and ydoc are all stable after mount (useMemo with []).
  const seedFromInitial = useCallback((opts?: { force?: boolean }) => {
    if (seededRef.current || !initialJson) return
    // Online path: server holds an authoritative snapshot — never seed on top.
    // Do NOT set seededRef here: if the collab server turns out to be UNREACHABLE,
    // goOffline() must still be able to force-seed the last mirrored content.
    // (G11 regression: the IDB 'synced' handler calls seedFromInitial(force=false)
    // ~100ms after mount, BEFORE the 4s offline fallback. Marking seeded in this
    // branch pre-empted goOffline's force-seed, leaving a doc-with-collab-state
    // empty whenever the collab server was down. force-seed ignores hasCollabState,
    // so leaving seededRef false here is safe — settled/seededRef still guard against
    // double-seeding once either onSynced or goOffline wins.)
    if (!opts?.force && hasCollabStateRef.current) {
      return
    }
    // G11: IDB sync-completion guard — if IDB exists but has not yet finished
    // loading its stored updates into the ydoc, DEFER: return without setting
    // seededRef so the IDB 'synced' handler can call seedFromInitial() once
    // loading is complete. This prevents the race where onSynced (or goOffline)
    // fires before IDB applies its updates, causing seedFromInitial to run with
    // an empty fragment, followed by IDB applying updates on top — duplicating
    // content. The 'synced' handler always calls seedFromInitial() after setting
    // both refs, so deferring here is safe and the seed is never skipped entirely.
    if (idb !== null && !idbSyncedRef.current) {
      // Deferred — IDB 'synced' handler will call us once loading is complete.
      // Latch a force=true intent so the IDB handler resolves it as a force-seed
      // (an offline fallback that deferred here must not be downgraded to a plain
      // seed that the hasCollabState branch would refuse).
      if (opts?.force) deferredForceRef.current = true
      return
    }
    // G11: IDB had-content guard — if IDB has already loaded content into this
    // ydoc, do NOT seed from initialJson. The IDB state IS the local source of
    // truth; seeding on top would duplicate content exactly like the D4 race.
    // Applies even in the force=true offline path.
    if (idbHadContentRef.current) {
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

  // G11: IDB sync handler — must be declared AFTER seedFromInitial so the callback
  // reference is stable when the effect registers. The effect sets idbSyncedRef and
  // idbHadContentRef, then calls seedFromInitial to resolve any deferred seed that
  // was blocked waiting for IDB to finish loading.
  useEffect(() => {
    if (!idb) return
    // idb may have already fired 'synced' synchronously before this effect runs
    // (unlikely but guard it). Check `.synced` first.
    if (idb.synced) {
      idbSyncedRef.current = true
      idbHadContentRef.current = ydoc.get(FIELD, Y.XmlFragment).length > 0
      // IDB already done — resolve any deferred seedFromInitial call (e.g. from
      // onSynced or goOffline that fired before this effect registered). Pass the
      // latched force so a deferred OFFLINE fallback still force-seeds.
      seedFromInitial({ force: deferredForceRef.current })
      return
    }
    const handleSynced = () => {
      idbSyncedRef.current = true
      idbHadContentRef.current = ydoc.get(FIELD, Y.XmlFragment).length > 0
      // IDB has finished loading. If seedFromInitial was called by onSynced or
      // goOffline before IDB completed, it deferred without setting seededRef.
      // Now that IDB state is known, attempt the seed — passing the latched force
      // so a deferred OFFLINE fallback still force-seeds. The guards inside
      // seedFromInitial will correctly skip if IDB had content or the server
      // already seeded.
      seedFromInitial({ force: deferredForceRef.current })
    }
    idb.on('synced', handleSynced)
    return () => {
      idb.off('synced', handleSynced)
    }
  }, [idb, ydoc, seedFromInitial])

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

  // G11: Destroy the IDB persistence on unmount to close the IndexedDB connection
  // and release the store. The ydoc itself is garbage-collected by React; idb
  // listens for doc.on('destroy') internally but we also call destroy() explicitly
  // here to ensure the connection is released even if doc isn't destroyed first.
  useEffect(() => {
    return () => {
      idb?.destroy().catch(() => {
        // Ignore errors on unmount — best-effort cleanup.
      })
    }
  }, [idb])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pageSetup, setPageSetup] = useState<PageSetup>(DEFAULT_PAGE_SETUP)
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const [pageCount, setPageCount] = useState(1)

  // G9: watermark state — seeded from server-rendered initialWatermark
  const [watermark, setWatermark] = useState<WatermarkConfig>(initialWatermark ?? DEFAULT_WATERMARK)
  const [watermarkOpen, setWatermarkOpen] = useState(false)

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

  // G5: drawing modal — holds the doc position + current scene of the drawing
  // node being edited (null = closed). Opened via parchment:edit-drawing event
  // dispatched by DrawingView (click) and insertDrawing command (new node).
  const [drawingEdit, setDrawingEdit] = useState<{ pos: number; scene: object | null } | null>(null)

  // G6a: mermaid editor popover — holds the doc position + current source of
  // the mermaid node being edited (null = closed). Opened via
  // parchment:edit-mermaid event dispatched by MermaidView (click) and from
  // the slash-menu handler after insertMermaid().run().
  const [mermaidEdit, setMermaidEdit] = useState<{ pos: number; source: string } | null>(null)

  // G6b: plantuml editor popover — holds the doc position + current source of
  // the plantuml node being edited (null = closed). Opened via
  // parchment:edit-plantuml event dispatched by PlantumlView (click) and from
  // the slash-menu handler after insertPlantuml().run().
  const [plantumlEdit, setPlantumlEdit] = useState<{ pos: number; source: string } | null>(null)

  // G6c: drawio editor modal — holds the doc position + current xml of the
  // drawio node being edited (null = closed). Opened via parchment:edit-drawio
  // event dispatched by DrawioView (click) and from the slash-menu handler
  // after insertDrawio().run().
  const [drawioEdit, setDrawioEdit] = useState<{ pos: number; xml: string } | null>(null)

  // G8b: cross-reference picker — open = true when the slash-menu "Cross-reference"
  // item is selected. The CrossRefPicker lists the doc's live targets; picking one
  // calls insertCrossRef at the current cursor position.
  const [crossRefPickerOpen, setCrossRefPickerOpen] = useState(false)
  const openCrossRefPicker = useCallback(() => setCrossRefPickerOpen(true), [])

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

  // G15: Reading mode overlay — full-bleed read-only view.
  const [readingOpen, setReadingOpen] = useState(false)

  // G16: Presenter mode — full-screen slideshow.
  const [presenterOpen, setPresenterOpen] = useState(false)
  // Ref so the F5 keydown handler ([] deps) can read the current value without
  // staling. This avoids a double-setState race with PresenterView's F5 handler.
  const presenterOpenRef = useRef(false)
  presenterOpenRef.current = presenterOpen

  const canvasWrapRef = useRef<HTMLDivElement>(null)

  // G12: page-fit — scaled host ref and page natural height tracking.
  //
  // Design choices (fixes for review findings 3, 4, 7, 14):
  //
  //  3. Feedback loop fix: we observe `canvasWrapRef` (the parent container)
  //     for width changes instead of `scaledHostRef` (the host itself). The
  //     host's own height is set by our CSS calc() rule, so observing it would
  //     trigger applyScale on every applyScale call — an infinite loop on mobile.
  //     Observing the parent container (whose size we don't modify) is stable.
  //
  //  4. Unscaled height fix: we read `.parchment-page-content` offsetHeight for
  //     the natural page height. The content div is NOT the element the CSS
  //     height-compensation rule targets, so its offsetHeight is always the
  //     unscaled content height, unaffected by the host's collapsed CSS height.
  //
  //  7. Debounce fix: applyScale is wrapped in requestAnimationFrame to batch
  //     concurrent resize + RO callbacks into a single read-write cycle per
  //     frame, preventing layout thrash on orientation change.
  //
  // 14. Stale-height fix: we observe both the canvas wrap (for container width
  //     changes) AND .parchment-page-content (for content growth changes), so
  //     applyScale re-runs whenever the user types more text.
  const scaledHostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = scaledHostRef.current
    const wrap = canvasWrapRef.current
    if (!host || !wrap) return

    let rafId: number | null = null

    // Debounce via rAF to prevent layout thrash when the resize event and the
    // ResizeObserver fire concurrently (e.g. on orientation change).
    const scheduleApply = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        applyScale()
      })
    }

    // Letter page width in px (816). We read the actual page element width
    // on first measure to handle any page-setup changes.
    const applyScale = () => {
      const availableWidth = wrap.offsetWidth

      // Read the natural (unscaled) page dimensions from .parchment-page-content.
      // This inner content div is NOT the element the CSS height-compensation
      // rule targets, so its offsetHeight is always the true unscaled height —
      // it is never clamped by the host's CSS calc() height constraint.
      const pageEl = host.querySelector<HTMLElement>('.parchment-page')
      const contentEl = host.querySelector<HTMLElement>('.parchment-page-content')
      const pageWidth = pageEl ? pageEl.offsetWidth : 816
      // Use the content div for height; fall back to pageEl if content is absent.
      const pageHeight = contentEl ? contentEl.offsetHeight : pageEl ? pageEl.offsetHeight : 1056

      const isMobile = isMobileWidth(availableWidth)
      if (!isMobile) {
        // Desktop: clear any mobile overrides — byte-for-byte unchanged above 768px.
        host.style.removeProperty('--page-scale')
        host.style.removeProperty('--page-natural-height')
        host.style.height = ''
        return
      }

      const scale = pageFitScale(availableWidth, pageWidth)
      // Set both vars in the same frame to avoid the invalid calc() fallback
      // (auto * number is invalid CSS; 0px * number collapses host visibly).
      host.style.setProperty('--page-natural-height', `${pageHeight}px`)
      host.style.setProperty('--page-scale', String(scale))
    }

    applyScale()

    // Observe the PARENT container (canvasWrapRef) for available-width changes.
    // We must NOT observe `host` (scaledHostRef) because on mobile the CSS rule
    // `height: calc(--page-natural-height * --page-scale)` makes the host's own
    // height change on every applyScale call, which would re-trigger the RO →
    // infinite feedback loop. The parent container's size is not modified by us.
    const ro = new ResizeObserver(scheduleApply)
    ro.observe(wrap)

    // Also observe .parchment-page-content so applyScale re-runs when content
    // grows (the host's CSS-fixed height won't reflect new content otherwise).
    const contentEl = host.querySelector<HTMLElement>('.parchment-page-content')
    if (contentEl) ro.observe(contentEl)

    // Also listen to window resize for viewport width changes (orientation change).
    window.addEventListener('resize', scheduleApply, { passive: true })

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('resize', scheduleApply)
    }
  }, [])

  // G12: swipe-to-page — horizontal touch gesture on the canvas scroll wrapper.
  //
  // Design choices (fixes for review findings 1, 2, 5, 10, 11, 12, 13):
  //
  //  1. Mobile-width gate: the handler returns early when the viewport is wider
  //     than the mobile breakpoint (768px). This prevents swipe from firing on
  //     touch-capable desktop viewports (Surface, touch laptops).
  //
  //  2/5/13. Per-page height: uses resolvePageDims(pageSetup).heightPx (e.g.
  //     1056px for Letter) instead of pageEl.scrollHeight (which is the TOTAL
  //     document height). pageEl is a single continuous div, not per-page DOM;
  //     its scrollHeight equals total content height, making the old calculation
  //     always yield currentPage=0 and target=bottom of document.
  //
  // 10. Upper bound: uses pageCount - 1 (the React state tracking total pages)
  //     instead of Math.floor(scrollHeight / scrollHeight) which always equals 1.
  //
  // 11. Axis tracking: a touchmove listener records the peak |dy| during the
  //     gesture. If |dy| ever exceeded |dx| at any point, the swipe is suppressed
  //     (the user was primarily scrolling vertically). This prevents page jumps
  //     from diagonal scroll gestures.
  //
  // 12. Multi-touch guard: checks e.changedTouches.length !== 1 at touchend
  //     (fingers lifting) instead of e.touches.length > 0 (still-active touches),
  //     which fails to catch simultaneous two-finger lifts.
  const swipeTouchRef = useRef<{ x: number; y: number; peakDy: number } | null>(null)

  useEffect(() => {
    const wrap = canvasWrapRef.current
    if (!wrap) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        // Multi-touch (pinch) — clear state so touchend ignores this gesture.
        swipeTouchRef.current = null
        return
      }
      const t = e.touches[0]
      if (t) swipeTouchRef.current = { x: t.clientX, y: t.clientY, peakDy: 0 }
    }

    // Track the peak vertical displacement during the gesture so we can
    // suppress the swipe if the user was primarily scrolling vertically.
    const onTouchMove = (e: TouchEvent) => {
      const start = swipeTouchRef.current
      if (!start || e.touches.length !== 1) return
      const t = e.touches[0]
      if (!t) return
      const dy = Math.abs(t.clientY - start.y)
      if (dy > start.peakDy) start.peakDy = dy
    }

    const onTouchEnd = (e: TouchEvent) => {
      const start = swipeTouchRef.current
      swipeTouchRef.current = null
      // Guard: must have exactly one changing finger, and must have a start point.
      if (!start || e.changedTouches.length !== 1) return

      // Issue 1: gate on mobile-width so touch-capable desktops are unaffected.
      if (!isMobileWidth(window.innerWidth)) return

      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y

      // Issue 11: suppress if the gesture was ever more vertical than horizontal.
      if (start.peakDy > Math.abs(dx)) return

      const direction = classifySwipe(dx, dy)
      if (direction === 'none') return

      // Issue 2/5/13: use the logical page height from pageSetup, not scrollHeight.
      // resolvePageDims accounts for orientation (portrait vs landscape).
      const { heightPx: pageHeight } = resolvePageDims(pageSetup)
      if (pageHeight <= 0) return

      const currentScroll = window.scrollY
      const currentPage = Math.floor(currentScroll / pageHeight)
      // Issue 10: upper bound is pageCount - 1 (total pages - 1 zero-based index).
      const maxPage = Math.max(0, pageCount - 1)
      const targetPage =
        direction === 'next' ? Math.min(currentPage + 1, maxPage) : Math.max(currentPage - 1, 0)

      const targetY = targetPage * pageHeight
      window.scrollTo({ top: targetY, behavior: 'smooth' })
    }

    wrap.addEventListener('touchstart', onTouchStart, { passive: true })
    wrap.addEventListener('touchmove', onTouchMove, { passive: true })
    wrap.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove', onTouchMove)
      wrap.removeEventListener('touchend', onTouchEnd)
    }
  }, [pageSetup, pageCount])

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
      // G8b: onOpenCrossRefPicker opens the cross-reference picker.
      SlashMenuExtension.configure({
        onOpenImage: openImageDialog,
        onEditMath: openMathEditor,
        onOpenCrossRefPicker: openCrossRefPicker,
      }),
      // F6: [[ autocomplete — drives the React WikiSuggestionMenu popup. Wired
      // here (not baseExtensions) so its ReactRenderer popup only loads client-side.
      WikiSuggestionExtension,
      // G7b: @ cite autocomplete — drives the React CiteSuggestionMenu popup.
      // Wired here (not baseExtensions) so its ReactRenderer only loads client-side.
      // Uses a DISTINCT PluginKey('citeSuggestion') — never shares a key with
      // slashMenu or wikiSuggestion (F6 lesson).
      CiteSuggestionExtension,
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

  // G5: drawing NodeViews dispatch parchment:edit-drawing {pos, scene} on click
  // — open the Excalidraw modal seeded with the clicked node's current scene.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pos: number; scene: object | null }>).detail
      if (detail && typeof detail.pos === 'number') {
        setDrawingEdit({ pos: detail.pos, scene: detail.scene ?? null })
      }
    }
    dom.addEventListener('parchment:edit-drawing', handler)
    return () => dom.removeEventListener('parchment:edit-drawing', handler)
  }, [editor])

  // G6a: mermaid NodeViews dispatch parchment:edit-mermaid {pos, source} on
  // click — open the mermaid popover seeded with the clicked node's source.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pos: number; source: string }>).detail
      if (detail && typeof detail.pos === 'number') {
        setMermaidEdit({ pos: detail.pos, source: detail.source ?? '' })
      }
    }
    dom.addEventListener('parchment:edit-mermaid', handler)
    return () => dom.removeEventListener('parchment:edit-mermaid', handler)
  }, [editor])

  // G6b: plantuml NodeViews dispatch parchment:edit-plantuml {pos, source} on
  // click — open the plantuml popover seeded with the clicked node's source.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pos: number; source: string }>).detail
      if (detail && typeof detail.pos === 'number') {
        setPlantumlEdit({ pos: detail.pos, source: detail.source ?? '' })
      }
    }
    dom.addEventListener('parchment:edit-plantuml', handler)
    return () => dom.removeEventListener('parchment:edit-plantuml', handler)
  }, [editor])

  // G6c: drawio NodeViews dispatch parchment:edit-drawio {pos, xml} on click
  // — open the drawio modal seeded with the clicked node's current XML.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pos: number; xml: string }>).detail
      if (detail && typeof detail.pos === 'number') {
        setDrawioEdit({ pos: detail.pos, xml: detail.xml ?? '' })
      }
    }
    dom.addEventListener('parchment:edit-drawio', handler)
    return () => dom.removeEventListener('parchment:edit-drawio', handler)
  }, [editor])

  // G8b: crossRef NodeViews dispatch parchment:goto-ref {targetId} on click —
  // scroll the target node into view. We find the target in the doc by querying
  // the PM dom for [data-ref-id="..."] (for figures/tables/equations) or #id
  // (for headings), then scrollIntoView smooth/center.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = (e: Event) => {
      const targetId = (e as CustomEvent<{ targetId: string }>).detail?.targetId
      if (!targetId) return
      // Query the editor's DOM for a node with this refId or heading id.
      const el =
        dom.querySelector(`[data-ref-id="${CSS.escape(targetId)}"]`) ??
        dom.querySelector(`#${CSS.escape(targetId)}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    dom.addEventListener('parchment:goto-ref', handler)
    return () => dom.removeEventListener('parchment:goto-ref', handler)
  }, [editor])

  // G16: F5 keydown → open presenter mode (only when closed).
  // When the presenter is already open, PresenterView owns F5 and closes it.
  // Guarding with presenterOpenRef prevents a double-setState race: without the
  // guard, both this handler and PresenterView's handler fire in the same event,
  // and React 18's functional-update batching can chain false → !false = true,
  // leaving the presenter stuck open. With the guard this handler is a no-op
  // when the overlay is active, so F5 ownership is exclusive.
  // preventDefault stops the browser's default page-refresh behaviour (note:
  // some browser/OS combinations may still refresh before the JS handler fires
  // — the toolbar button is the safe fallback).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault()
        if (!presenterOpenRef.current) {
          setPresenterOpen(true)
        }
        // When the presenter IS open, PresenterView's keydown handler closes it.
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
          onOpenWatermark={() => setWatermarkOpen(true)}
          onToggleComments={() => setCommentsSidebarOpen((v) => !v)}
          commentsSidebarOpen={commentsSidebarOpen}
          onToggleVersionHistory={() => setVersionHistoryOpen((v) => !v)}
          versionHistoryOpen={versionHistoryOpen}
          onToggleSuggestions={() => setSuggestionsOpen((v) => !v)}
          suggestionsOpen={suggestionsOpen}
          onToggleBacklinks={() => setBacklinksOpen((v) => !v)}
          backlinksOpen={backlinksOpen}
          onOpenShare={() => setShareDialogOpen(true)}
          onToggleReading={() => setReadingOpen((v) => !v)}
          readingOpen={readingOpen}
          onTogglePresenter={() => setPresenterOpen((v) => !v)}
          presenterOpen={presenterOpen}
        />
      )}

      <h1 className="mb-4 font-semibold text-2xl tracking-tight">{initialTitle}</h1>

      {/* B11: outline rail + canvas in a flex row; D1: comments sidebar on the right */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
        {/* B11: outline pane (left rail) */}
        {editor && <OutlinePane editor={editor} />}

        {/* B9: find + replace panel — positioned relative to this wrapper */}
        <div ref={canvasWrapRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          {/* G12: scaled host — CSS var --page-scale is set by the page-fit hook
              above. On desktop the var is absent / 1 so transform:scale(1) is a
              no-op. On mobile the host height collapses to pageHeight×scale so
              no empty gap appears below the shrunken page.
              CRITICAL: ResizeObserver in PageCanvas watches .parchment-page-content
              (the INNER unscaled content div), so pagination metrics are computed
              on un-transformed dimensions and are never corrupted by the scale. */}
          <div ref={scaledHostRef} className="parchment-canvas-scaled-host">
            <PageCanvas
              pageSetup={pageSetup}
              onPageCountChange={setPageCount}
              editor={editor}
              watermark={watermark}
            >
              <EditorContent editor={editor} />
            </PageCanvas>
          </div>

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

      {/* Selection bubble menu (B2 + G13: AI actions) */}
      {editor && <BubbleMenu editor={editor} aiEnabled={aiEnabled} />}

      {/* G11: online/offline + sync status indicator */}
      <OfflineIndicator provider={provider} />

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

      {/* G5: Drawing editor modal */}
      {editor && drawingEdit !== null && (
        <DrawingModal
          editor={editor}
          pos={drawingEdit.pos}
          initialScene={drawingEdit.scene}
          onClose={() => setDrawingEdit(null)}
        />
      )}

      {/* G6a: Mermaid diagram editor popover */}
      {editor && mermaidEdit !== null && (
        <MermaidPopover
          editor={editor}
          pos={mermaidEdit.pos}
          initialSource={mermaidEdit.source}
          onClose={() => setMermaidEdit(null)}
        />
      )}

      {/* G6b: PlantUML diagram editor popover */}
      {editor && plantumlEdit !== null && (
        <PlantumlPopover
          editor={editor}
          pos={plantumlEdit.pos}
          initialSource={plantumlEdit.source}
          onClose={() => setPlantumlEdit(null)}
        />
      )}

      {/* G6c: Drawio diagram editor modal */}
      {editor && drawioEdit !== null && (
        <DrawioModal
          editor={editor}
          pos={drawioEdit.pos}
          initialXml={drawioEdit.xml}
          onClose={() => setDrawioEdit(null)}
        />
      )}

      {/* G8b: Cross-reference picker — opened from the slash-menu "Cross-reference" item */}
      {editor && crossRefPickerOpen && (
        <CrossRefPicker
          editor={editor}
          onPick={(targetId, kind) => {
            setCrossRefPickerOpen(false)
            editor.chain().focus().insertCrossRef(targetId, kind).run()
          }}
          onClose={() => setCrossRefPickerOpen(false)}
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

      {/* G9: Watermark dialog */}
      {watermarkOpen && (
        <WatermarkDialog
          initial={watermark}
          docId={docId}
          onApply={setWatermark}
          onClose={() => setWatermarkOpen(false)}
        />
      )}

      {/* G1: Share dialog */}
      {shareDialogOpen && <ShareDialog docId={docId} onClose={() => setShareDialogOpen(false)} />}

      {/* G15: Reading mode overlay — rendered outside the layout flow so it is
          full-screen fixed. Content is a snapshot of editor.getJSON() at render
          time — read-only view via renderReadOnlyDoc, no editor/contenteditable. */}
      {readingOpen && editor && (
        <ReadingView
          content={editor.getJSON()}
          docId={docId}
          onClose={() => setReadingOpen(false)}
        />
      )}

      {/* G16: Presenter mode overlay — full-screen slideshow. Content is a
          snapshot of editor.getJSON() at open time. PresenterView manages its
          own keyboard handler and fullscreen lifecycle. */}
      {presenterOpen && editor && (
        <PresenterView docJson={editor.getJSON()} onClose={() => setPresenterOpen(false)} />
      )}
    </div>
  )
}
