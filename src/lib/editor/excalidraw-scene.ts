/**
 * v0.2.2 #8 — Excalidraw scene sanitizer.
 *
 * Excalidraw's `appState` carries runtime-only fields that do NOT survive JSON
 * persistence. The worst offender is `appState.collaborators`, a `Map` at runtime.
 * `JSON.stringify` serializes a Map to `{}` (and other code paths can leave it as
 * `[]` / `null`), so when the saved scene is fed back into Excalidraw via
 * `initialData`, Excalidraw calls `collaborators.forEach(...)` on the degraded
 * value and throws:
 *
 *     TypeError: e.appState.collaborators.forEach is not a function
 *
 * which takes the whole editor down (the DrawingModal render throws during mount).
 *
 * `sanitizeDrawingScene` strips `collaborators` and the other volatile/runtime
 * appState fields so the scene is safe to BOTH persist (on save) and re-seed (on
 * load — this repairs drawings already saved with the bad shape). It is pure and
 * non-mutating (returns a shallow clone with a cleaned `appState`), and a no-op for
 * null / non-object inputs.
 */

/**
 * Runtime-only / non-serializable appState keys. `collaborators` is the crash
 * trigger; the rest are transient interaction state that should never be persisted
 * (and could carry element references that are stale on reload).
 */
const RUNTIME_APPSTATE_KEYS = [
  'collaborators',
  'selectedElementIds',
  'selectedGroupIds',
  'editingElement',
  'draggingElement',
  'resizingElement',
  'editingLinearElement',
  'multiElement',
  'selectionElement',
  'pendingImageElementId',
] as const

export function sanitizeDrawingScene<T>(scene: T): T {
  if (scene === null || typeof scene !== 'object') return scene

  const s = scene as Record<string, unknown>
  const appState = s.appState
  if (appState === null || appState === undefined || typeof appState !== 'object') {
    // No appState (or a degenerate one) → nothing to strip; return a shallow clone
    // so callers can rely on a fresh object.
    return { ...s } as T
  }

  const cleanAppState: Record<string, unknown> = { ...(appState as Record<string, unknown>) }
  for (const key of RUNTIME_APPSTATE_KEYS) {
    delete cleanAppState[key]
  }

  return { ...s, appState: cleanAppState } as T
}
