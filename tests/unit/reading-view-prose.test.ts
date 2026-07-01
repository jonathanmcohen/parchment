// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.8 #3 — Reading mode must wrap the rendered document in `.parchment-prose`
// so the editor's block styles (code blocks, tables, math, task lists, …) apply.
// Before this the read-only fragment sat bare inside `.parchment-reading` and
// every block rendered unformatted.

// Keep the Shiki annotate pass out of the unit env (it dynamically imports the
// highlighter); we only assert the DOM wrapper, not the highlighting itself.
vi.mock('@/lib/export/html', () => ({
  annotateDocWithShiki: (doc: unknown) => Promise.resolve(doc),
}))

import { ReadingView } from '@/components/editor/ReadingView'

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

describe('ReadingView — .parchment-prose wrapper', () => {
  it('wraps the rendered doc in a .parchment-prose element inside the reading area', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'codeBlock',
          attrs: { language: 'js' },
          content: [{ type: 'text', text: 'const x = 1' }],
        },
      ],
    }
    const root = createRoot(container)
    act(() => {
      root.render(createElement(ReadingView, { content: doc, docId: 'doc1', onClose: () => {} }))
    })

    const prose = container.querySelector('.parchment-reading .parchment-prose')
    expect(prose, '.parchment-prose wrapper inside .parchment-reading').toBeTruthy()
    // The code block still renders as a <pre><code> inside the prose wrapper.
    expect(prose?.querySelector('pre code'), 'code block rendered inside prose').toBeTruthy()
    expect(prose?.textContent).toContain('const x = 1')

    act(() => root.unmount())
  })
})
