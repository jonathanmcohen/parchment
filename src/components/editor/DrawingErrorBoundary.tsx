'use client'
// v0.2.2 #8 — error boundary around the Excalidraw render.
//
// Even with the scene sanitizer, a future Excalidraw bug (or an unexpected scene
// shape) throwing during render would otherwise unmount the entire editor tree
// ("the page couldn't load"). This boundary catches a render throw from its
// subtree and shows an inline fallback so the surrounding DrawingModal (and the
// editor behind it) stay alive and the user can close the modal cleanly.
import { Component, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Optional fallback; defaults to a small inline message. */
  fallback?: ReactNode
}

type State = { hasError: boolean }

export class DrawingErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: unknown) {
    // Log only the message — never the scene (could be large).
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[parchment] drawing editor failed to render:', msg)
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '1rem',
              textAlign: 'center',
              color: 'var(--muted)',
            }}
          >
            This drawing could not be opened for editing. Close this dialog and try
            again; your document is unaffected.
          </div>
        )
      )
    }
    return this.props.children
  }
}
