// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SuggestionsPanel } from '@/components/editor/SuggestionsPanel'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

// H Task 16 — the SuggestionsPanel renders per-change Accept/Reject wired to
// acceptChange/rejectChange and drives the editor doc. Also covers the suggesting
// toggle reflecting storage (aria-pressed equivalent).

let editor: Editor
let container: HTMLDivElement

beforeEach(() => {
  editor = new Editor({ extensions: baseExtensions, content: '<p>hello world</p>' })
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  editor.destroy()
  container.remove()
})

function docText(): string {
  let t = ''
  editor.state.doc.descendants((n) => {
    if (n.isText) t += n.text ?? ''
    return true
  })
  return t
}

function applyMark(from: number, to: number, type: 'insertion' | 'deletion') {
  editor.commands.command(({ tr, dispatch, state }) => {
    const mt = state.schema.marks[type]
    if (dispatch && mt) {
      tr.addMark(from, to, mt.create({ author: 'alice', color: '#1a73e8' }))
      dispatch(tr)
    }
    return true
  })
}

describe('SuggestionsPanel drives the doc (Task 16)', () => {
  it('Accept on an insertion keeps the text + removes the mark', async () => {
    applyMark(1, 6, 'insertion') // "hello"
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(SuggestionsPanel, { editor }))
    })

    // Find the per-change Accept button and click it.
    const acceptBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Accept insertion"]',
    )
    expect(acceptBtn).not.toBeNull()
    await act(async () => {
      acceptBtn?.click()
    })

    expect(docText()).toContain('hello')
    let hasInsertion = false
    editor.state.doc.descendants((n) => {
      if (n.isText && n.marks.some((m) => m.type.name === 'insertion')) hasInsertion = true
      return true
    })
    expect(hasInsertion).toBe(false)

    await act(async () => {
      root.unmount()
    })
  })

  it('Reject all removes insertion text', async () => {
    applyMark(1, 6, 'insertion')
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(SuggestionsPanel, { editor }))
    })
    const rejectAll = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Reject all changes"]',
    )
    await act(async () => {
      rejectAll?.click()
    })
    expect(docText()).not.toContain('hello')

    await act(async () => {
      root.unmount()
    })
  })
})

describe('suggesting toggle reflects storage (Task 16)', () => {
  it('toggleSuggesting flips editor.storage.suggesting.enabled', () => {
    expect(editor.storage.suggesting.enabled).toBe(false)
    editor.commands.toggleSuggesting()
    expect(editor.storage.suggesting.enabled).toBe(true)
  })
})
