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
import { CustomCssDialog } from '@/components/editor/CustomCssDialog'
import { CustomCssStyle } from '@/components/editor/CustomCssStyle'
import { DocTitleBar } from '@/components/editor/DocTitleBar'
import { DrawioModal } from '@/components/editor/DrawioModal'
import { EmbedDialog } from '@/components/editor/EmbedDialog'
import { FindReplace } from '@/components/editor/FindReplace'
import { GithubEmbedDialog } from '@/components/editor/GithubEmbedDialog'
import { GrammarPanel } from '@/components/editor/GrammarPanel'
import { ImageDialog } from '@/components/editor/ImageDialog'
import { LinkPopover } from '@/components/editor/LinkPopover'
import { MathPopover } from '@/components/editor/MathPopover'
import { MenuBar } from '@/components/editor/MenuBar'
import { MermaidPopover } from '@/components/editor/MermaidPopover'
import { OutlinePane } from '@/components/editor/OutlinePane'
import { PageCanvas } from '@/components/editor/PageCanvas'
import { PageSetupDialog } from '@/components/editor/PageSetupDialog'
import { PlantumlPopover } from '@/components/editor/PlantumlPopover'
import { PresenterView } from '@/components/editor/PresenterView'
import { PrintView } from '@/components/editor/PrintView'
import { ReadingPresence } from '@/components/editor/ReadingPresence'
import { ReadingView } from '@/components/editor/ReadingView'
import { SectionBreakDialog } from '@/components/editor/SectionBreakDialog'
import { ShareDialog } from '@/components/editor/ShareDialog'
import { StatusBar } from '@/components/editor/StatusBar'
import { SuggestionsPanel } from '@/components/editor/SuggestionsPanel'
import { Toolbar } from '@/components/editor/Toolbar'
import { useConnectionState } from '@/components/editor/useConnectionState'
import { useSaveStatus } from '@/components/editor/useSaveStatus'
import { VersionHistory } from '@/components/editor/VersionHistory'
import { WatermarkDialog } from '@/components/editor/WatermarkDialog'
import { WordCountDialog } from '@/components/editor/WordCountDialog'
import { UserCluster } from '@/components/shell/UserCluster'
import {
  registerShortcutAction,
  SHORTCUT_EVENT,
  type ShortcutEventDetail,
} from '@/components/shortcuts/GlobalShortcuts'
import { clampAutosaveMs } from '@/lib/docs/autosave-config'
import { getCollabUrl } from '@/lib/editor/collab-url'
import { type Counts, countText } from '@/lib/editor/counts'
import { CUSTOM_CSS_SCOPE } from '@/lib/editor/custom-css'
import { resolveProvider } from '@/lib/editor/embed-providers'
import { CairnSuggestionExtension } from '@/lib/editor/extensions/cairn-suggestion'
import { CiteSuggestionExtension } from '@/lib/editor/extensions/cite-suggestion'
import { FindReplaceExtension } from '@/lib/editor/extensions/find-replace'
import { GrammarCheckExtension } from '@/lib/editor/extensions/grammar-check'
import { SlashMenuExtension } from '@/lib/editor/extensions/slash-menu'
import { WikiSuggestionExtension } from '@/lib/editor/extensions/wiki-suggestion'
import { classifySwipe, isMobileWidth, pageFitScale } from '@/lib/editor/page-fit'
import { DEFAULT_PAGE_SETUP, type PageSetup, resolvePageDims } from '@/lib/editor/paginate'
import { type Reader, throttle } from '@/lib/editor/reading-presence'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'
import { authorColor } from '@/lib/editor/track-changes'
import { DEFAULT_WATERMARK, type WatermarkConfig } from '@/lib/editor/watermark'
import { githubWebUrl } from '@/lib/integrations/github'
import { serializeMarkdown } from '@/lib/markdown/serialize'

// G5: DrawingModal is dynamic-imported so the Excalidraw CSS (imported at the
// top of DrawingModal.tsx) is NOT pulled into the Editor chunk on every page
// load — it is only fetched when a drawing modal is first opened.
const DrawingModal = dynamic(
  () => import('@/components/editor/DrawingModal').then((m) => m.DrawingModal),
  { ssr: false },
)

// I2 Part 3: SourceMode is dynamic-imported so the CodeMirror 6 + @replit vim
// modules it loads are split OUT of the main editor chunk — they are fetched
// only when the user first toggles into Vim source mode.
const SourceMode = dynamic(
  () => import('@/components/editor/SourceMode').then((m) => m.SourceMode),
  { ssr: false },
)

type Props = {
  docId: string
  initialTitle: string
  /** C4: the doc's current starred state — server-rendered from documents.starred
   * so the title-bar Star icon reflects reality on mount and survives reload. */
  initialStarred: boolean
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
  /** G17: raw custom CSS from documents.meta.customCss; sanitize+scope at render. */
  initialCustomCss?: string
  /** G13: true when AI_BASE_URL is configured server-side. Never derived client-side. */
  aiEnabled?: boolean
  /** I3: autosave version-snapshot interval in ms (clamped to 5s–5min, default 30s). */
  autosaveIntervalMs?: number
  /** K6: the owner's browser-native-spellcheck preference (default ON). */
  spellcheckEnabled?: boolean
  /** K7: true when LANGUAGETOOL_URL is configured server-side. Never derived client-side. */
  grammarEnabled?: boolean
}

const FIELD = 'default'

// B0 editor island. Bound to a Y.Doc via Collaboration so Plan D drops in the
// Hocuspocus network provider with no rework. For single-user v0.1 the Y.Doc is
// seeded from the stored ProseMirror JSON and autosave persists JSON + markdown.
// D4: HocuspocusProvider syncs the Y.Doc to the collab server in real-time.
export function Editor({
  docId,
  initialTitle,
  initialStarred,
  initialJson,
  currentUserName,
  currentUserId,
  hasCollabState,
  initialWatermark,
  initialCustomCss,
  aiEnabled = false,
  autosaveIntervalMs = 30_000,
  spellcheckEnabled = true,
  grammarEnabled = false,
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
        url: getCollabUrl(),
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

  // G17: custom CSS state — seeded from server-rendered initialCustomCss
  const [customCss, setCustomCss] = useState(initialCustomCss ?? '')
  const [customCssOpen, setCustomCssOpen] = useState(false)

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

  // J2/J3: embed dialog — holds the doc position + kind + current url/title of
  // the embed node being edited (null = closed). Opened from the slash menu
  // (new empty node, after insertEmbed().run()) and from clicking an existing
  // embed node (parchment:edit-embed event dispatched by EmbedView).
  const [embedEdit, setEmbedEdit] = useState<{
    pos: number
    kind: 'calendar' | 'spreadsheet'
    url: string
    title: string
  } | null>(null)
  const openEmbedDialog = useCallback((pos: number, kind: 'calendar' | 'spreadsheet') => {
    setEmbedEdit({ pos, kind, url: '', title: '' })
  }, [])

  // J6: github embed dialog — holds the doc position + seed url/title of the
  // githubEmbed node being edited (null = closed). Opened from the slash menu
  // (new empty node, after insertGithubEmbed().run()) and from clicking an
  // existing node (parchment:edit-github-embed event from GithubEmbedView).
  const [githubEmbedEdit, setGithubEmbedEdit] = useState<{
    pos: number
    url: string
    title: string
  } | null>(null)
  const openGithubEmbedDialog = useCallback((pos: number) => {
    setGithubEmbedEdit({ pos, url: '', title: '' })
  }, [])

  const openMathEditor = useCallback((pos: number) => {
    setMathEdit({ pos, latex: '' })
  }, [])

  // D1: comments sidebar toggle
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false)
  // F3: monotonic "open the composer" intent. The toolbar "Add comment" button
  // bumps this; CommentsSidebar reacts to each change in its OWN effect (which
  // runs after the sidebar mounts), so the signal cannot be dropped against the
  // sidebar's mount the way a one-shot DOM event could. 0 = no request yet.
  const [openComposerSignal, setOpenComposerSignal] = useState(0)

  // D3: version history panel toggle
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)

  // D2: suggestions panel toggle
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

  // K7: grammar-check panel toggle (only reachable when grammar is enabled).
  const [grammarPanelOpen, setGrammarPanelOpen] = useState(false)

  // F6: backlinks panel toggle
  const [backlinksOpen, setBacklinksOpen] = useState(false)

  // G1: share-management dialog toggle
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  // S3-5: outline pane open-state lifted here so View → Show outline and the
  // pane's internal chevron drive ONE shared boolean (no desync).
  const [outlineOpen, setOutlineOpen] = useState(true)

  // S3-2/S3-6: Tools → Word count modal (sourced from the existing counts).
  const [wordCountOpen, setWordCountOpen] = useState(false)

  // D5: reading presence readers list + canvas wrapper ref
  const [readers, setReaders] = useState<Reader[]>([])

  // G15: Reading mode overlay — full-bleed read-only view.
  const [readingOpen, setReadingOpen] = useState(false)

  // H2: Print / PDF view — client-side via paged.js + window.print().
  const [printOpen, setPrintOpen] = useState(false)

  // G16: Presenter mode — full-screen slideshow.
  const [presenterOpen, setPresenterOpen] = useState(false)
  // Ref so the F5 keydown handler ([] deps) can read the current value without
  // staling. This avoids a double-setState race with PresenterView's F5 handler.
  const presenterOpenRef = useRef(false)
  presenterOpenRef.current = presenterOpen

  // I2 Part 3: Vim source-mode toggle. While open we hide the WYSIWYG editor so
  // the user cannot make concurrent local edits to the Y.Doc; the snapshot is
  // taken at open time and applied as a single transaction on exit.
  const [sourceModeOpen, setSourceModeOpen] = useState(false)
  // I2 Part 3 — COLLAB SAFETY: source mode replaces the whole document, which
  // would clobber concurrent remote edits. We therefore disable it whenever
  // another peer is present in the Y.Doc awareness (a live collaboration). When
  // solo, the wholesale replace is safe. This is the explicit GAP-logged
  // restriction: source mode is not offered during active multi-user editing.
  const [collabActive, setCollabActive] = useState(false)

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

  // S3-1 (DECISION 4): a small save-status state wrapped around the existing
  // fire-and-forget save. The save PATH is unchanged — we only observe in-flight
  // (markSaving) and settled (markSaved) so the title-bar slot can read the
  // state. S5-9 supplies the COPY.
  const { status: saveStatus, markSaving, markSaved } = useSaveStatus()
  const save = useCallback(
    (json: Record<string, unknown>) => {
      const markdown = serializeMarkdown(json)
      markSaving()
      void fetch(`/api/docs/${docId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentJson: json, markdown }),
      }).finally(() => {
        markSaved()
      })
    },
    [docId, markSaving, markSaved],
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
        // J2/J3: onEditEmbed opens the EmbedDialog for a freshly-inserted embed node.
        onEditEmbed: openEmbedDialog,
        // J6: onEditGithubEmbed opens the GithubEmbedDialog for a freshly-inserted
        // githubEmbed node.
        onEditGithubEmbed: openGithubEmbedDialog,
      }),
      // F6: [[ autocomplete — drives the React WikiSuggestionMenu popup. Wired
      // here (not baseExtensions) so its ReactRenderer popup only loads client-side.
      WikiSuggestionExtension,
      // J1: [[cairn:// autocomplete — drives the React CairnSuggestionMenu popup.
      // Wired here (not baseExtensions) so its ReactRenderer only loads
      // client-side. Uses a DISTINCT PluginKey('cairnSuggestion') — never shares
      // a key with slashMenu, wikiSuggestion, or citeSuggestion (F6 lesson). The
      // longer `[[cairn://` trigger fires only after the plain `[[` wiki trigger.
      CairnSuggestionExtension,
      // G7b: @ cite autocomplete — drives the React CiteSuggestionMenu popup.
      // Wired here (not baseExtensions) so its ReactRenderer only loads client-side.
      // Uses a DISTINCT PluginKey('citeSuggestion') — never shares a key with
      // slashMenu or wikiSuggestion (F6 lesson).
      CiteSuggestionExtension,
      // K7: grammar-check decorations. Uses a DISTINCT PluginKey('grammarCheck')
      // — never shares a key with slashMenu/wikiSuggestion/citeSuggestion/
      // cairnSuggestion/findReplace (F6 lesson). Only registered when LanguageTool
      // is enabled server-side; with no extension the doc carries no grammar state.
      ...(grammarEnabled ? [GrammarCheckExtension] : []),
    ],
    editorProps: {
      // K6: drive the ProseMirror contenteditable's `spellcheck` attr from the
      // owner's setting. When false, the browser-native squiggles are disabled.
      attributes: {
        class: 'parchment-prose',
        // role=textbox + aria-multiline makes aria-label valid on the
        // contenteditable div (a bare div may not carry aria-label —
        // axe aria-prohibited-attr) and is the correct semantic for a
        // rich-text editor surface.
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document editor',
        spellcheck: spellcheckEnabled ? 'true' : 'false',
      },
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
  // I3: interval driven by autosaveIntervalMs prop (clamped defensively to 5s–5min).
  // Re-creates the interval when docId, editor, or the interval duration changes.
  const lastSnapshotMd = useRef<string | null>(null)
  // Minor (I2): pause version-snapshot autosave while source mode is open. In
  // source mode the WYSIWYG editor is frozen at the open-time snapshot (the user
  // edits markdown in CodeMirror, not the Y.Doc), so the interval would keep
  // POSTing the same stale snapshot — and could snapshot pre-exit content. Read
  // via a ref so toggling source mode doesn't tear down/recreate the interval.
  const sourceModeOpenRef = useRef(false)
  sourceModeOpenRef.current = sourceModeOpen
  useEffect(() => {
    const clampedMs = clampAutosaveMs(autosaveIntervalMs)
    const interval = setInterval(() => {
      if (!editor) return
      // Skip snapshots entirely while source mode is active; resume on exit.
      if (sourceModeOpenRef.current) return
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
    }, clampedMs)
    return () => clearInterval(interval)
  }, [docId, editor, autosaveIntervalMs])

  // B10: derive full-document and selection counts reactively via useEditorState.
  // The selector runs on every transaction so counts stay in sync with edits and
  // selection changes without extra state variables.
  const counts = useEditorState({
    editor,
    selector: (
      ctx,
    ): { full: Counts; selection: Counts | null; mode: 'editing' | 'suggesting' | 'viewing' } => {
      if (!ctx.editor) return { full: { words: 0, chars: 0 }, selection: null, mode: 'editing' }
      const full = countText(ctx.editor.getText())
      const { from, to } = ctx.editor.state.selection
      const selectionText = from === to ? null : ctx.editor.state.doc.textBetween(from, to, ' ')
      const selection = selectionText !== null ? countText(selectionText) : null
      // LT5-2: derive the live editing mode the same way the Toolbar dropdown
      // does (Toolbar.tsx:249) — non-editable → viewing, D2 suggesting plugin
      // enabled → suggesting, else editing. No new mode state is introduced.
      const mode: 'editing' | 'suggesting' | 'viewing' = !ctx.editor.isEditable
        ? 'viewing'
        : ctx.editor.storage.suggesting?.enabled === true
          ? 'suggesting'
          : 'editing'
      return { full, selection, mode }
    },
  })

  const full: Counts = counts?.full ?? { words: 0, chars: 0 }
  const selection: Counts | null = counts?.selection ?? null
  const editorMode: 'editing' | 'suggesting' | 'viewing' = counts?.mode ?? 'editing'

  // S3-6: the connection state (online/syncing/offline) that the standalone
  // OfflineIndicator pill used to render — now a dot in the status bar's right
  // slot. Same derivation, new placement (no new connection logic).
  const connection = useConnectionState(provider)

  // F3: "Add comment" — reuse the D1 create flow. Open the sidebar AND bump the
  // composer-open intent in the SAME state update, then pass that intent into
  // CommentsSidebar as a prop. The sidebar opens its composer (which reads the
  // live editor selection and POSTs via the SAME handleAddComment path) from its
  // own effect once mounted, so a freshly-mounted sidebar never misses the
  // signal — no rAF/DOM-event race against the child's mount. No parallel
  // comment system.
  const handleAddComment = useCallback(() => {
    if (!editor) return
    setCommentsSidebarOpen(true)
    setOpenComposerSignal((n) => n + 1)
  }, [editor])

  // F3: once the sidebar has consumed the open-composer intent, clear it so a
  // later rail toggle (which re-mounts CommentsSidebar) does not re-open the
  // composer for a stale signal value. Stable so it doesn't re-fire the child's
  // open effect.
  const resetOpenComposerSignal = useCallback(() => setOpenComposerSignal(0), [])

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

  // I2 Part 3 — snapshot the current doc as PM-JSON when entering source mode.
  const [sourceSnapshot, setSourceSnapshot] = useState<Record<string, unknown> | null>(null)

  // I2 Part 3 — COLLAB-SAFETY watcher state (finding D). While source mode is
  // open the WYSIWYG editor is hidden, so the user cannot edit the Y.Doc through
  // it; therefore ANY Y.Doc `update` that fires during the session is CONCURRENT,
  // committed content (a peer who joined after open, the same user editing from
  // another tab/device over y-indexeddb or Hocuspocus). Such updates do NOT bump
  // awareness size, so the open-time `collabActive` check cannot see them. We
  // latch a flag whenever one fires and refuse to blind-overwrite on exit.
  const sourceDocChangedRef = useRef(false)

  const openSourceMode = useCallback(() => {
    if (!editor || collabActive) return
    sourceDocChangedRef.current = false
    setSourceSnapshot(editor.getJSON() as Record<string, unknown>)
    setSourceModeOpen(true)
  }, [editor, collabActive])

  // While source mode is open, watch the live Y.Doc for ANY update. Because the
  // WYSIWYG is hidden, every update is external/concurrent content that a blind
  // exit-replace would clobber. We also auto-exit nothing (the user keeps their
  // markdown edits) but mark the doc changed so exitSourceMode requires explicit
  // confirmation before overwriting. Bound to the live ydoc, not a snapshot.
  useEffect(() => {
    if (!sourceModeOpen) return
    const onUpdate = () => {
      sourceDocChangedRef.current = true
    }
    ydoc.on('update', onUpdate)
    // Also treat a peer ARRIVING mid-session as a change signal (covers the case
    // where a peer joins but has not yet produced a content update).
    const awareness = provider?.awareness
    const onAwareness = () => {
      if (awareness && awareness.getStates().size > 1) sourceDocChangedRef.current = true
    }
    awareness?.on('change', onAwareness)
    return () => {
      ydoc.off('update', onUpdate)
      awareness?.off('change', onAwareness)
    }
  }, [sourceModeOpen, ydoc, provider])

  // Exit source mode: replace the editor content with the re-parsed markdown as a
  // SINGLE transaction. Because Collaboration is bound to the Y.Doc, this one
  // setContent writes one CRDT update — never a character-by-character replay.
  // emitUpdate:true so onUpdate fires and the disk-mirror/markdown is saved.
  //
  // COLLAB SAFETY (finding D): a wholesale setContent does
  // replaceWith(0, size, …) — it overwrites the WHOLE doc, clobbering anything
  // that CRDT-merged in during the session. We close the clobber TWO ways:
  //   1. live watcher — sourceDocChangedRef is latched true if any Y.Doc update
  //      or new peer arrived while source mode was open (these do not bump
  //      awareness size, so the open-time check cannot catch them); AND
  //   2. re-snapshot at exit — compare the live doc JSON now against the open-time
  //      snapshot; if it differs, content changed underneath us.
  // If EITHER signals a change we do NOT blind-overwrite — we require an explicit
  // user confirmation first. Confirming proceeds with the replace (the user
  // accepts losing the concurrent edits in favor of their markdown); cancelling
  // aborts the exit so source mode stays open and nothing is lost.
  const exitSourceMode = useCallback(
    (updatedJson: Record<string, unknown>) => {
      if (editor) {
        // Re-snapshot the LIVE doc and compare to the open-time snapshot. A
        // structural change here means content merged in concurrently.
        const liveJson = editor.getJSON() as Record<string, unknown>
        const changedSinceOpen =
          sourceSnapshot !== null && JSON.stringify(liveJson) !== JSON.stringify(sourceSnapshot)
        const concurrentEdits = sourceDocChangedRef.current || changedSinceOpen

        if (concurrentEdits) {
          const proceed =
            typeof window === 'undefined'
              ? false
              : window.confirm(
                  'This document changed elsewhere while you were editing the source ' +
                    '(another tab, device, or collaborator). Saving the source view will ' +
                    'OVERWRITE those changes. Overwrite anyway?\n\n' +
                    'Cancel to keep editing the source without saving.',
                )
          if (!proceed) {
            // Abort the exit — keep source mode open so nothing is lost. The user
            // can copy their markdown out, then cancel/reopen, before deciding.
            return
          }
        }

        editor.commands.setContent(updatedJson, { emitUpdate: true })
      }
      sourceDocChangedRef.current = false
      setSourceModeOpen(false)
      setSourceSnapshot(null)
    },
    [editor, sourceSnapshot],
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

  // J2/J3: embed NodeViews dispatch parchment:edit-embed {pos, provider, url,
  // title} on click — open the EmbedDialog seeded with the clicked node's
  // current values. The dialog kind defaults from the stored provider's kind
  // (calendar vs spreadsheet); when unknown it defaults to spreadsheet (the
  // wider input set). The user can paste any URL regardless of the kind label.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pos: number; url: string; title: string }>).detail
      if (detail && typeof detail.pos === 'number') {
        const url = detail.url ?? ''
        const resolved = url ? resolveProvider(url) : null
        const kind = resolved?.provider.kind === 'calendar' ? 'calendar' : 'spreadsheet'
        setEmbedEdit({ pos: detail.pos, kind, url, title: detail.title ?? '' })
      }
    }
    dom.addEventListener('parchment:edit-embed', handler)
    return () => dom.removeEventListener('parchment:edit-embed', handler)
  }, [editor])

  // J6: githubEmbed NodeViews dispatch parchment:edit-github-embed {pos, owner,
  // repo, number, kind, title} on click — open the GithubEmbedDialog seeded with
  // the clicked node's canonical github.com URL (rebuilt from owner/repo/number/
  // kind via githubWebUrl) and title. A node with no ref yet seeds an empty url.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          pos: number
          owner: string
          repo: string
          number: number
          kind: 'pr' | 'issue'
          title: string
        }>
      ).detail
      if (detail && typeof detail.pos === 'number') {
        const hasRef =
          typeof detail.owner === 'string' &&
          detail.owner.length > 0 &&
          typeof detail.repo === 'string' &&
          detail.repo.length > 0 &&
          typeof detail.number === 'number' &&
          detail.number > 0
        const url = hasRef
          ? githubWebUrl({
              owner: detail.owner,
              repo: detail.repo,
              number: detail.number,
              kind: detail.kind === 'pr' ? 'pr' : 'issue',
            })
          : ''
        setGithubEmbedEdit({ pos: detail.pos, url, title: detail.title ?? '' })
      }
    }
    dom.addEventListener('parchment:edit-github-embed', handler)
    return () => dom.removeEventListener('parchment:edit-github-embed', handler)
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

  // G16 / I2: TOGGLE presenter mode. The presenter binding is owned by the
  // central GlobalShortcuts dispatcher (default F5, remappable), which
  // preventDefault()s the combo and fires parchment:shortcut. This handler
  // listens for the 'presenter' action.
  //
  // Finding B: this is the SOLE owner of the remappable presenter key. It must
  // TOGGLE (open when closed, close when open) so that when the user remaps the
  // presenter away from F5, the remapped key closes the overlay too — previously
  // it only opened (PresenterView hardcoded the close to raw F5/Escape, which a
  // remapped key never delivers). presenterOpenRef is read (not the state) so the
  // []-deps effect never stales. PresenterView keeps Escape-to-close and the
  // close button; it no longer owns a raw key, so there is no double-setState
  // race (this handler is the only producer of `presenter`-driven state changes).
  //
  // Finding C: register the `presenter` action so the dispatcher only
  // intercepts F5 (and suppresses the browser reload) while a document editor is
  // mounted. On every non-editor page `presenter` is unregistered, so F5 falls
  // through to the browser.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ShortcutEventDetail>).detail
      if (detail?.action !== 'presenter') return
      setPresenterOpen(!presenterOpenRef.current)
    }
    window.addEventListener(SHORTCUT_EVENT, handler)
    const unregister = registerShortcutAction('presenter')
    return () => {
      window.removeEventListener(SHORTCUT_EVENT, handler)
      unregister()
    }
  }, [])

  // I2 Part 3 — track whether another peer is actively present in the Y.Doc.
  // Source mode (a wholesale content replace) is gated on this being false so we
  // never clobber a live collaborator's concurrent edits. When the provider is
  // absent (offline) the doc is effectively solo, so collab is never "active".
  useEffect(() => {
    if (!provider) {
      setCollabActive(false)
      return
    }
    const awareness = provider.awareness
    if (!awareness) {
      setCollabActive(false)
      return
    }
    const update = () => {
      // >1 awareness state means at least one OTHER client besides us.
      setCollabActive(awareness.getStates().size > 1)
    }
    update()
    awareness.on('change', update)
    return () => awareness.off('change', update)
  }, [provider])

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
    // S1-2: full-bleed gray gutter the white page floats on (editor route only).
    // The inner max-w-5xl keeps the centered column; the shell paints the gutter
    // edge-to-edge inside the shared <main> (negative margin cancels its padding).
    <div className="parchment-editor-shell">
      {/* L1+L2+L7: full-width sticky chrome stack. The three bars are lifted OUT
          of the centered body column so their backgrounds + bottom borders bleed
          edge-to-edge of the main content area; each bar's own inner wrapper
          (.parchment-*-inner) re-centers its controls at the body max-width.
          The bars are individually sticky (title top:0/z-30, menu top:56px/z-20,
          toolbar top:88px/z-10) so they stack flush to 136px on scroll. */}
      <header className="parchment-chrome-stack">
        {/* S3-1: pinned doc title bar (first child) — inline-editable title via
            the title-only /rename endpoint, save-status slot, share/comments/
            history wired to existing handlers, S2-5 avatar cluster. */}
        <DocTitleBar
          docId={docId}
          initialTitle={initialTitle}
          initialStarred={initialStarred}
          saveStatus={saveStatus}
          connection={connection}
          onToggleComments={() => setCommentsSidebarOpen((v) => !v)}
          onToggleVersionHistory={() => setVersionHistoryOpen((v) => !v)}
          onOpenShare={() => setShareDialogOpen(true)}
          avatar={<UserCluster name={currentUserName} />}
        />

        {/* S3-2: menu bar (PARTIAL) — File/Edit/View/Insert/Format/Tools/
            Extensions/Help; every non-placeholder row re-surfaces an existing
            handler, placeholders are visibly disabled. */}
        {editor && (
          <MenuBar
            editor={editor}
            docId={docId}
            onToggleVersionHistory={() => setVersionHistoryOpen((v) => !v)}
            onOpenPageSetup={() => setPageSetupOpen(true)}
            onExportPdf={() => setPrintOpen(true)}
            onInsertImage={() => openImageDialog()}
            onOpenLink={openLinkPopover}
            onToggleComments={() => setCommentsSidebarOpen((v) => !v)}
            openFind={openFind}
            onToggleOutline={() => setOutlineOpen((v) => !v)}
            onOpenWordCount={() => setWordCountOpen(true)}
            onToggleGrammar={() => setGrammarPanelOpen((v) => !v)}
            grammarEnabled={grammarEnabled}
          />
        )}

        {/* Inline formatting toolbar (B2) */}
        {editor && (
          <Toolbar
            editor={editor}
            onInsertImage={openImageDialog}
            onOpenLink={openLinkPopover}
            onCropImage={openCropForSelection}
            onOpenPageSetup={() => setPageSetupOpen(true)}
            onOpenWatermark={() => setWatermarkOpen(true)}
            onOpenCustomCss={() => setCustomCssOpen(true)}
            onToggleComments={() => setCommentsSidebarOpen((v) => !v)}
            commentsSidebarOpen={commentsSidebarOpen}
            onAddComment={handleAddComment}
            onToggleVersionHistory={() => setVersionHistoryOpen((v) => !v)}
            versionHistoryOpen={versionHistoryOpen}
            onToggleSuggestions={() => setSuggestionsOpen((v) => !v)}
            suggestionsOpen={suggestionsOpen}
            onToggleBacklinks={() => setBacklinksOpen((v) => !v)}
            backlinksOpen={backlinksOpen}
            onToggleGrammar={() => setGrammarPanelOpen((v) => !v)}
            grammarOpen={grammarPanelOpen}
            grammarEnabled={grammarEnabled}
            onOpenShare={() => setShareDialogOpen(true)}
            onToggleReading={() => setReadingOpen((v) => !v)}
            readingOpen={readingOpen}
            onTogglePresenter={() => setPresenterOpen((v) => !v)}
            presenterOpen={presenterOpen}
            onExportPdf={() => setPrintOpen(true)}
            onToggleSourceMode={openSourceMode}
            sourceModeOpen={sourceModeOpen}
            sourceModeDisabled={collabActive}
          />
        )}
      </header>

      {/* L6: the editor body (outline + canvas row, status bar, dialogs) spans the
          FULL main content area — the old `mx-auto max-w-5xl` clamp is removed so
          the outline anchors flush at the 256px sidebar edge (L4) and the page
          centers in the remaining gutter to its right (L5). The CHROME stack
          keeps its own full-bleed + centered-inner (L1/L2/L7); this is body only. */}
      <div>
        {/* S3-1: the plain read-only <h1> is superseded by the inline-editable
            title in <DocTitleBar> above. */}

        {/* I2 Part 3: Vim source-mode editor. Rendered in place of the WYSIWYG
          canvas. The editor instance stays mounted (display:none below) so the
          Y.Doc/collab binding is never torn down; on exit we apply the parsed
          markdown back into it as a single transaction. */}
        {sourceModeOpen && sourceSnapshot && (
          <div className="mb-4 rounded-md border border-[var(--border)] overflow-hidden">
            <SourceMode json={sourceSnapshot} onExit={exitSourceMode} />
          </div>
        )}

        {/* B11: outline rail + canvas in a flex row; D1: comments sidebar on the right */}
        <div
          style={{
            display: sourceModeOpen ? 'none' : 'flex',
            alignItems: 'flex-start',
            gap: 0,
          }}
        >
          {/* B11/S3-5: outline pane (left rail) — open-state lifted here so
              View → Show outline + the chevron drive one shared boolean. */}
          {editor && (
            <OutlinePane
              editor={editor}
              open={outlineOpen}
              onToggle={() => setOutlineOpen((v) => !v)}
            />
          )}

          {/* B9: find + replace panel — positioned relative to this wrapper.
              L5: this flex:1 column IS the gutter container — it owns the
              horizontal overflow (overflow-x:auto) so ONLY the gutter scrolls
              sideways at high zoom×width while the sticky chrome + fixed status
              bar stay put, and it pads ≥24px above/below the centered page
              (.parchment-page mx-auto). The gutter field color is painted by the
              .parchment-editor-shell (--editor-gutter). */}
          <div
            ref={canvasWrapRef}
            className="parchment-canvas-gutter"
            style={{ position: 'relative', flex: 1, minWidth: 0 }}
          >
            {/* G12: scaled host — CSS var --page-scale is set by the page-fit hook
              above. On desktop the var is absent / 1 so transform:scale(1) is a
              no-op. On mobile the host height collapses to pageHeight×scale so
              no empty gap appears below the shrunken page.
              CRITICAL: ResizeObserver in PageCanvas watches .parchment-page-content
              (the INNER unscaled content div), so pagination metrics are computed
              on un-transformed dimensions and are never corrupted by the scale. */}
            {/* G17: scope class wraps doc content ONLY (not toolbar/chrome).
              CustomCssStyle injects the sanitized+scoped <style> here. */}
            <div ref={scaledHostRef} className={`parchment-canvas-scaled-host ${CUSTOM_CSS_SCOPE}`}>
              <CustomCssStyle css={customCss} />
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
          {editor && commentsSidebarOpen && (
            <CommentsSidebar
              docId={docId}
              editor={editor}
              openComposerSignal={openComposerSignal}
              onComposerOpened={resetOpenComposerSignal}
            />
          )}

          {/* D3: version history panel (right rail) */}
          {editor && versionHistoryOpen && <VersionHistory docId={docId} editor={editor} />}

          {/* D2: suggestions panel (right rail) */}
          {editor && suggestionsOpen && <SuggestionsPanel editor={editor} />}

          {/* K7: grammar-check panel (right rail) — only when LanguageTool is enabled */}
          {editor && grammarEnabled && grammarPanelOpen && (
            <GrammarPanel editor={editor} onClose={() => setGrammarPanelOpen(false)} />
          )}

          {/* F6: backlinks panel (right rail) */}
          {editor && backlinksOpen && <BacklinksPanel docId={docId} />}
        </div>

        {/* Selection bubble menu (B2 + G13: AI actions) */}
        {editor && <BubbleMenu editor={editor} aiEnabled={aiEnabled} />}

        {/* S3-6: the standalone OfflineIndicator sibling is folded into the
            status bar's connection dot below (one bar, no separate pill). */}
        <StatusBar
          pageCount={pageCount}
          full={full}
          selection={selection}
          readers={readers.map((r) => r.user)}
          connection={connection}
          mode={editorMode}
          onOpenWordCount={() => setWordCountOpen(true)}
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

        {/* J2/J3: Embed (calendar / spreadsheet) URL dialog */}
        {editor && embedEdit !== null && (
          <EmbedDialog
            editor={editor}
            pos={embedEdit.pos}
            kind={embedEdit.kind}
            initialUrl={embedEdit.url}
            initialTitle={embedEdit.title}
            onClose={() => setEmbedEdit(null)}
          />
        )}

        {/* J6: GitHub PR/issue embed URL dialog */}
        {editor && githubEmbedEdit !== null && (
          <GithubEmbedDialog
            editor={editor}
            pos={githubEmbedEdit.pos}
            initialUrl={githubEmbedEdit.url}
            initialTitle={githubEmbedEdit.title}
            onClose={() => setGithubEmbedEdit(null)}
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

        {/* G17: Custom CSS dialog */}
        {customCssOpen && (
          <CustomCssDialog
            initial={customCss}
            docId={docId}
            onApply={setCustomCss}
            onClose={() => setCustomCssOpen(false)}
          />
        )}

        {/* G1: Share dialog */}
        {shareDialogOpen && <ShareDialog docId={docId} onClose={() => setShareDialogOpen(false)} />}

        {/* S3-2/S3-6: Tools → Word count modal (existing counts; on-demand
            read-time that S3-6 removed from the always-on status bar). */}
        {wordCountOpen && (
          <WordCountDialog
            full={full}
            selection={selection}
            pageCount={pageCount}
            onClose={() => setWordCountOpen(false)}
          />
        )}

        {/* G15: Reading mode overlay — rendered outside the layout flow so it is
          full-screen fixed. Content is a snapshot of editor.getJSON() at render
          time — read-only view via renderReadOnlyDoc, no editor/contenteditable. */}
        {readingOpen && editor && (
          <ReadingView
            content={editor.getJSON()}
            docId={docId}
            customCss={customCss}
            onClose={() => setReadingOpen(false)}
          />
        )}

        {/* G16: Presenter mode overlay — full-screen slideshow. Content is a
          snapshot of editor.getJSON() at open time. PresenterView manages its
          own keyboard handler and fullscreen lifecycle. */}
        {presenterOpen && editor && (
          <PresenterView docJson={editor.getJSON()} onClose={() => setPresenterOpen(false)} />
        )}

        {/* H2: Print / PDF overlay — paged.js paginates a read-only snapshot of the
          doc with @page rules matching the editor canvas, then window.print()
          sends it to the browser print dialog for "Save as PDF". */}
        {printOpen && editor && (
          <PrintView
            content={editor.getJSON()}
            pageSetup={pageSetup}
            onClose={() => setPrintOpen(false)}
          />
        )}
      </div>
    </div>
  )
}
