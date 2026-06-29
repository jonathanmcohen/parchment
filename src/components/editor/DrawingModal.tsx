'use client'

import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import type { Editor } from '@tiptap/core'
import dynamic from 'next/dynamic'
import { useId, useMemo, useRef, useState } from 'react'
import { DrawingErrorBoundary } from '@/components/editor/DrawingErrorBoundary'
import { sanitizeDrawingScene } from '@/lib/editor/excalidraw-scene'

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
 * Persisted appState: sanitizeDrawingScene() strips the runtime-only fields
 * before we write the scene back to the node. Critically `appState.collaborators`
 * is a Map at runtime — JSON.stringify degrades it to `{}` and Excalidraw then
 * calls collaborators.forEach() on reload and crashes the editor (#8). The live
 * appState is still passed to exportToSvg for the SVG snapshot (export tolerates
 * it); only the PERSISTED scene is sanitized. On load we also sanitize
 * initialScene to repair drawings saved before this fix, and the Excalidraw
 * render is wrapped in an error boundary as a last-resort safety net.
 */
export function DrawingModal({ editor, pos, initialScene, onClose }: Props) {
  const titleId = useId()
  const apiRef = useRef<ExcalidrawAPI | null>(null)
  const [saving, setSaving] = useState(false)

  // #8: sanitize the incoming scene so an already-saved drawing with a degraded
  // appState.collaborators (a `{}`/`[]` where Excalidraw expects a Map) is repaired
  // before it ever reaches Excalidraw's initialData path. Memoized on the raw scene.
  const safeInitialScene = useMemo(
    () => (initialScene !== null ? sanitizeDrawingScene(initialScene) : null),
    [initialScene],
  )

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

      // #8: strip runtime-only appState (collaborators Map, selection/editing
      // state) BEFORE persisting so a reload never re-feeds Excalidraw a degraded
      // collaborators value. The live appState above was used for the SVG export.
      const scene = sanitizeDrawingScene({ elements, appState, files })
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
          {/* #8: a render throw from Excalidraw (e.g. a future bad-scene bug) must
              not unmount the whole editor — the boundary keeps the modal usable. */}
          <DrawingErrorBoundary>
            <Excalidraw
              {...(safeInitialScene !== null
                ? { initialData: safeInitialScene as ExcalidrawInitialDataState }
                : {})}
              excalidrawAPI={(api) => {
                apiRef.current = api
              }}
            />
          </DrawingErrorBoundary>
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
