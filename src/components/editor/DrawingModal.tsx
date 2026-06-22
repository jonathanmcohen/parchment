'use client'

import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import type { Editor } from '@tiptap/core'
import dynamic from 'next/dynamic'
import { useId, useRef, useState } from 'react'

// Import the Excalidraw CSS (client-only). The dynamic import below ensures
// the Excalidraw component itself is never evaluated server-side.
import '@excalidraw/excalidraw/index.css'

/**
 * Dynamic import of Excalidraw with ssr:false so it is never evaluated in the
 * server runtime (it requires `window`). The thunk is module-level so the
 * import() is created once, not on every render.
 */
const Excalidraw = dynamic(() => import('@excalidraw/excalidraw').then((m) => m.Excalidraw), {
  ssr: false,
})

type ExcalidrawAPI = ExcalidrawImperativeAPI

type Props = {
  editor: Editor
  /** Document position of the drawing node being edited. */
  pos: number
  /** The drawing node's current scene, used to seed Excalidraw. */
  initialScene: object | null
  onClose: () => void
}

/**
 * G5: DrawingModal — full-screen Excalidraw editor modal.
 *
 * Opens seeded with the drawing node's saved scene. On Done it exports the
 * scene elements + appState + files and an SVG snapshot, then calls
 * editor.commands.updateDrawing() to write them back to the node. Cancel
 * discards without writing.
 *
 * Persisted appState keys: only the Excalidraw-meaningful display keys are
 * kept (viewBackgroundColor, currentItemFontFamily, etc.). Volatile/large
 * runtime keys like collaborators, selectedElementIds (empty on export), and
 * editingElement are NOT filtered because exportToSvg already handles them;
 * we pass the full appState for fidelity and let Excalidraw manage it.
 */
export function DrawingModal({ editor, pos, initialScene, onClose }: Props) {
  const titleId = useId()
  const apiRef = useRef<ExcalidrawAPI | null>(null)
  const [saving, setSaving] = useState(false)

  const handleDone = async () => {
    const api = apiRef.current
    if (!api) {
      onClose()
      return
    }
    setSaving(true)
    try {
      const elements = api.getSceneElements()
      const appState = api.getAppState()
      const files = api.getFiles()

      const { exportToSvg } = await import('@excalidraw/excalidraw')
      type ExportParams = Parameters<typeof exportToSvg>[0]
      const svgEl = await exportToSvg({
        elements: elements as ExportParams['elements'],
        appState: { ...appState, exportBackground: true } as ExportParams['appState'],
        files: files as ExportParams['files'],
      })
      const svg = svgEl.outerHTML

      const scene = { elements, appState, files }
      editor.commands.updateDrawing(pos, scene, svg)
      onClose()
    } catch (err) {
      console.error('[parchment] DrawingModal exportToSvg failed:', err)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX; keyboard close is handled by the inner dialog
    <div
      role="presentation"
      className="parchment-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="parchment-dialog"
        style={{ width: '90vw', maxWidth: '90vw', height: '90vh' }}
        onKeyDown={handleKeyDown}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Drawing
          </h2>
          <button
            type="button"
            aria-label="Close drawing editor"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Excalidraw needs an explicit-height container or it renders blank */}
        <div style={{ flex: 1, minHeight: 0, height: 'calc(70vh - 4rem)', position: 'relative' }}>
          <Excalidraw
            {...(initialScene !== null
              ? { initialData: initialScene as ExcalidrawInitialDataState }
              : {})}
            excalidrawAPI={(api) => {
              apiRef.current = api
            }}
          />
        </div>

        <div className="parchment-dialog-actions">
          <button
            type="button"
            className="parchment-dialog-btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="parchment-dialog-btn-primary"
            onClick={() => {
              void handleDone()
            }}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
