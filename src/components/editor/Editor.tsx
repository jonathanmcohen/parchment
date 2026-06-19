'use client'

import { getSchema } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import { EditorContent, useEditor } from '@tiptap/react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { prosemirrorJSONToYDoc } from 'y-prosemirror'
import * as Y from 'yjs'
import { BubbleMenu } from '@/components/editor/BubbleMenu'
import { ImageDialog } from '@/components/editor/ImageDialog'
import { PageCanvas } from '@/components/editor/PageCanvas'
import { StatusBar } from '@/components/editor/StatusBar'
import { Toolbar } from '@/components/editor/Toolbar'
import type { PageSize } from '@/lib/editor/paginate'
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

  const [size, setSize] = useState<PageSize>('Letter')
  const [pageCount, setPageCount] = useState(1)
  const [wordCount, setWordCount] = useState(0)

  // B5: image dialog state — null = closed; string = prefill src for paste/drop flow
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [imageDialogPrefillSrc, setImageDialogPrefillSrc] = useState<string | undefined>(undefined)

  const openImageDialog = useCallback((prefillSrc?: string) => {
    setImageDialogPrefillSrc(prefillSrc)
    setImageDialogOpen(true)
  }, [])

  const closeImageDialog = useCallback(() => {
    setImageDialogOpen(false)
    setImageDialogPrefillSrc(undefined)
  }, [])

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
    extensions: [...baseExtensions, Collaboration.configure({ document: ydoc, field: FIELD })],
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
      // Count words from plain text (split on whitespace, filter empties)
      const text = ed.getText()
      setWordCount(text.trim() === '' ? 0 : text.trim().split(/\s+/).length)
    },
  })

  return (
    <div className="mx-auto max-w-5xl">
      {/* Inline formatting toolbar (B2) */}
      {editor && <Toolbar editor={editor} docId={docId} onInsertImage={openImageDialog} />}

      {/* Page size toggle */}
      <div className="mb-4 flex items-center gap-2">
        {(['Letter', 'A4'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={size === s}
            onClick={() => setSize(s)}
            className="parchment-size-btn"
          >
            {s}
          </button>
        ))}
      </div>

      <h1 className="mb-4 font-semibold text-2xl tracking-tight">{initialTitle}</h1>

      <PageCanvas size={size} onPageCountChange={setPageCount}>
        <EditorContent editor={editor} />
      </PageCanvas>

      {/* Selection bubble menu (B2) */}
      {editor && <BubbleMenu editor={editor} />}

      <StatusBar pageCount={pageCount} wordCount={wordCount} />

      {/* B5: Image insert dialog */}
      {editor && imageDialogOpen && (
        <ImageDialog
          editor={editor}
          docId={docId}
          {...(imageDialogPrefillSrc !== undefined ? { prefillSrc: imageDialogPrefillSrc } : {})}
          onClose={closeImageDialog}
        />
      )}
    </div>
  )
}
