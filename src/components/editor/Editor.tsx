'use client'

import { getSchema } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import { EditorContent, useEditor } from '@tiptap/react'
import { useCallback, useMemo, useRef } from 'react'
import { prosemirrorJSONToYDoc } from 'y-prosemirror'
import * as Y from 'yjs'
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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [...baseExtensions, Collaboration.configure({ document: ydoc, field: FIELD })],
    editorProps: {
      attributes: { class: 'parchment-prose', 'aria-label': 'Document editor' },
    },
    onUpdate: ({ editor }) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => save(editor.getJSON() as Record<string, unknown>), 800)
    },
  })

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 font-semibold text-2xl tracking-tight">{initialTitle}</h1>
      <EditorContent editor={editor} />
    </div>
  )
}
