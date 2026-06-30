import { describe, expect, it, vi } from 'vitest'
import { dispatchShikiReadyOnMount } from '@/lib/editor/extensions/code-block-shiki'

// v0.2.2 #7: code-block highlighting was blank after a reload until the user
// edited. The decoration plugin rebuilds only on tr.docChanged or a 'shikiReady'
// meta; the ready dispatch lived in _initHighlighter which is gated on the
// module-global _initStarted. With a WARM highlighter (already initialised from a
// prior mount in the same session/SPA nav), a freshly-mounted view never received
// a 'shikiReady' meta, so its code blocks stayed plaintext until an edit forced a
// rebuild. The fix: every view() mount unconditionally awaits getHighlighter()
// then dispatches 'shikiReady' for THAT view. dispatchShikiReadyOnMount is that
// per-mount rebuild trigger, extracted pure so we can assert it here.

type FakeView = {
  isDestroyed: boolean
  state: { tr: { meta: Record<string, unknown>; setMeta: (k: string, v: unknown) => unknown } }
  dispatch: ReturnType<typeof vi.fn>
}

function makeView(isDestroyed = false): FakeView {
  const tr = {
    meta: {} as Record<string, unknown>,
    setMeta(k: string, v: unknown) {
      this.meta[k] = v
      return this
    },
  }
  return { isDestroyed, state: { tr }, dispatch: vi.fn() }
}

describe('dispatchShikiReadyOnMount', () => {
  it('dispatches a shikiReady meta on mount even when the highlighter is already warm', async () => {
    const view = makeView()
    // Warm highlighter: resolves immediately (the regression scenario — no init
    // dispatch would otherwise fire for this fresh mount).
    const getHl = vi.fn(async () => ({}))

    await dispatchShikiReadyOnMount(view as never, getHl as never)

    expect(getHl).toHaveBeenCalledTimes(1)
    expect(view.dispatch).toHaveBeenCalledTimes(1)
    const dispatchedTr = view.dispatch.mock.calls[0]?.[0] as { meta: Record<string, unknown> }
    expect(dispatchedTr.meta.shikiReady).toBe(true)
  })

  it('does NOT dispatch into a view that was destroyed before the highlighter resolved', async () => {
    const view = makeView(false)
    const getHl = vi.fn(async () => {
      // Simulate the view being torn down during the await.
      view.isDestroyed = true
      return {}
    })

    await dispatchShikiReadyOnMount(view as never, getHl as never)

    expect(getHl).toHaveBeenCalledTimes(1)
    expect(view.dispatch).not.toHaveBeenCalled()
  })
})
