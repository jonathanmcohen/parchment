import { describe, expect, it } from 'vitest'
import { sanitizeDrawingScene } from '@/lib/editor/excalidraw-scene'

// v0.2.2 #8: editing a saved drawing crashed the editor with
//   TypeError: e.appState.collaborators.forEach is not a function
// Excalidraw's appState.collaborators is a Map at runtime. JSON.stringify drops
// Maps to {} (or, depending on the source, to [] / null), and on the next open
// Excalidraw's initialData path calls collaborators.forEach(...) on that degraded
// value → crash that takes the whole editor down. sanitizeDrawingScene strips
// collaborators (and other non-serializable runtime appState fields) so it is
// never persisted (SAVE) and never fed back into Excalidraw (LOAD, repairing
// drawings already saved with the bad shape).

describe('sanitizeDrawingScene', () => {
  it('strips appState.collaborators when present as a plain object (degraded Map)', () => {
    const scene = {
      elements: [{ id: 'a', type: 'rectangle' }],
      appState: { viewBackgroundColor: '#fff', collaborators: { someId: { username: 'x' } } },
      files: {},
    }
    const out = sanitizeDrawingScene(scene) as { appState: Record<string, unknown> }
    expect('collaborators' in out.appState).toBe(false)
    // Other appState fields survive.
    expect(out.appState.viewBackgroundColor).toBe('#fff')
  })

  it('strips appState.collaborators when present as an array', () => {
    const scene = { appState: { collaborators: [['id', { username: 'x' }]] } }
    const out = sanitizeDrawingScene(scene) as { appState: Record<string, unknown> }
    expect('collaborators' in out.appState).toBe(false)
  })

  it('strips other non-serializable runtime appState fields', () => {
    const scene = {
      appState: {
        viewBackgroundColor: '#fff',
        collaborators: {},
        selectedElementIds: { a: true },
        editingElement: { id: 'e' },
        draggingElement: { id: 'd' },
      },
    }
    const out = sanitizeDrawingScene(scene) as { appState: Record<string, unknown> }
    for (const k of ['collaborators', 'selectedElementIds', 'editingElement', 'draggingElement']) {
      expect(k in out.appState).toBe(false)
    }
    expect(out.appState.viewBackgroundColor).toBe('#fff')
  })

  it('preserves elements and files verbatim', () => {
    const scene = {
      elements: [{ id: 'a' }, { id: 'b' }],
      appState: { collaborators: {} },
      files: { fileId: { dataURL: 'data:...' } },
    }
    const out = sanitizeDrawingScene(scene) as {
      elements: unknown[]
      files: Record<string, unknown>
    }
    expect(out.elements).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(out.files).toEqual({ fileId: { dataURL: 'data:...' } })
  })

  it('is a no-op-safe pass for null / non-object / missing appState', () => {
    expect(sanitizeDrawingScene(null)).toBeNull()
    expect(sanitizeDrawingScene(undefined as never)).toBeUndefined()
    // A scene with no appState round-trips unchanged (no throw).
    const noAppState = { elements: [{ id: 'a' }] }
    expect(sanitizeDrawingScene(noAppState)).toEqual(noAppState)
  })

  it('does not mutate the input scene (returns a fresh object)', () => {
    const scene = { appState: { collaborators: {}, viewBackgroundColor: '#fff' } }
    const out = sanitizeDrawingScene(scene)
    expect(out).not.toBe(scene)
    // Input still has its collaborators key (we cloned, not mutated).
    expect('collaborators' in scene.appState).toBe(true)
  })
})
