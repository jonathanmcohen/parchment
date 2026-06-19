'use client'

import { getSchema } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import { NodeSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prosemirrorJSONToYDoc } from 'y-prosemirror'
import * as Y from 'yjs'
import { BubbleMenu } from '@/components/editor/BubbleMenu'
import { CommentsSidebar } from '@/components/editor/CommentsSidebar'
import { CropDialog } from '@/components/editor/CropDialog'
import { FindReplace } from '@/components/editor/FindReplace'
import { ImageDialog } from '@/components/editor/ImageDialog'
import { LinkPopover } from '@/components/editor/LinkPopover'
import { OutlinePane } from '@/components/editor/OutlinePane'
import { PageCanvas } from '@/components/editor/PageCanvas'
import { PageSetupDialog } from '@/components/editor/PageSetupDialog'
import { SectionBreakDialog } from '@/components/editor/SectionBreakDialog'
import { StatusBar } from '@/components/editor/StatusBar'
import { SuggestionsPanel } from '@/components/editor/SuggestionsPanel'
import { Toolbar } from '@/components/editor/Toolbar'
import { VersionHistory } from '@/components/editor/VersionHistory'
import { type Counts, countText } from '@/lib/editor/counts'
import { FindReplaceExtension } from '@/lib/editor/extensions/find-replace'
import { SlashMenuExtension } from '@/lib/editor/extensions/slash-menu'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '@/lib/editor/paginate'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'
import { serializeMarkdown } from '@/lib/markdown/serialize'

type Props = {
  docId: string
  initialTitle: string
  initialJson: Record<string, unknown> | null
}

const FIELD = 'default'

// B0 editor island. Bound to a Y.Doc via Collaboration so Plan D drops in the
// Hocuspocus network provider with no rework. For single-user v0.1 the Y.Doc is
// seeded from the stored ProseMirror JSON and autosave persists JSON + markdown.
export function Editor({ docId, initialTitle, initialJson }: Props) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: seed the Y.Doc once on mount; later edits flow through Yjs, not a re-seed.
  const ydoc = useMemo(() => {
    const doc = new Y.Doc()
    if (initialJson) {
      const schema = getSchema(baseExtensions)
      const seeded = prosemirrorJSONToYDoc(schema, initialJson, FIELD)
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(seeded))
    }
    return doc
  }, [])

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

  // D1: comments sidebar toggle
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false)

  // D3: version history panel toggle
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)

  // D2: suggestions panel toggle
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...baseExtensions,
      Collaboration.configure({ document: ydoc, field: FIELD }),
      // B9: configured with onOpen so Cmd-F / Cmd-Shift-H open the React panel.
      FindReplaceExtension.configure({ onOpen: openFind }),
      // B12: slash menu — onOpenImage delegates to the existing image dialog.
      SlashMenuExtension.configure({ onOpenImage: openImageDialog }),
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
        />
      )}

      <h1 className="mb-4 font-semibold text-2xl tracking-tight">{initialTitle}</h1>

      {/* B11: outline rail + canvas in a flex row; D1: comments sidebar on the right */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
        {/* B11: outline pane (left rail) */}
        {editor && <OutlinePane editor={editor} />}

        {/* B9: find + replace panel — positioned relative to this wrapper */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <PageCanvas pageSetup={pageSetup} onPageCountChange={setPageCount} editor={editor}>
            <EditorContent editor={editor} />
          </PageCanvas>

          {editor && findOpen && (
            <FindReplace editor={editor} initialMode={findMode} onClose={closeFind} />
          )}
        </div>

        {/* D1: comments sidebar (right rail) */}
        {editor && commentsSidebarOpen && <CommentsSidebar docId={docId} editor={editor} />}

        {/* D3: version history panel (right rail) */}
        {editor && versionHistoryOpen && <VersionHistory docId={docId} editor={editor} />}

        {/* D2: suggestions panel (right rail) */}
        {editor && suggestionsOpen && <SuggestionsPanel editor={editor} />}
      </div>

      {/* Selection bubble menu (B2) */}
      {editor && <BubbleMenu editor={editor} />}

      <StatusBar pageCount={pageCount} full={full} selection={selection} />

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
    </div>
  )
}
