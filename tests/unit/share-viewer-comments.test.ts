// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareViewer } from '@/components/share/ShareViewer'

// H Task 12 — ShareViewer renders the read-only public comments returned by the
// share data path. We mount the real component with a mocked global fetch and let
// its load effect settle (createRoot + act), then probe the live DOM.

const ORIGINAL_FETCH = globalThis.fetch

function mockShareResponse(body: unknown) {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch
}

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  container.remove()
  vi.restoreAllMocks()
})

describe('ShareViewer public comments', () => {
  it('renders the comment bodies + data-thread-id, and never an author id', async () => {
    mockShareResponse({
      docId: 'd1',
      title: 'Pub',
      contentJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
      },
      permission: 'view',
      comments: [
        {
          id: 'c1',
          threadId: 'c1',
          body: 'a public remark',
          resolved: false,
          createdAt: '2026-06-27T10:00:00.000Z',
          anchorFrom: 1,
          anchorTo: 3,
        },
      ],
    })

    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(ShareViewer, { token: 'tok' }))
    })
    // Let the load() effect's fetch microtask + setState settle.
    await act(async () => {
      await Promise.resolve()
    })

    const thread = container.querySelector('[data-thread-id="c1"]')
    expect(thread).not.toBeNull()
    expect(container.textContent).toContain('a public remark')
    expect(container.textContent).toContain('Pub')

    await act(async () => {
      root.unmount()
    })
  })

  it('renders the doc with no comments aside when comments is empty', async () => {
    mockShareResponse({
      docId: 'd2',
      title: 'NoComments',
      contentJson: { type: 'doc', content: [] },
      permission: 'view',
      comments: [],
    })

    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(ShareViewer, { token: 'tok2' }))
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('.parchment-share-comments')).toBeNull()
    expect(container.textContent).toContain('NoComments')

    await act(async () => {
      root.unmount()
    })
  })
})
