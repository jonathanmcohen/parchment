// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

// v0.2.10 — smart typography + markdown input-rule gaps.
//
// Two concerns are proven here against the REAL editor extension list
// (baseExtensions), which now includes the SmartTypography extension:
//   1. Smart typography input rules fire while typing (quotes, dashes, ellipsis,
//      fractions, arrows, (c)/(r)/(tm)).
//   2. The markdown input rules the release audits — code-block language fence,
//      `---`/`***` divider, task-list `[ ]`/`[x]`, ordered list, ~~strike~~ —
//      each produce the correct node/mark in THIS config.
//
// CRITICAL: typography must NOT fire inside a code block, inline code, or math.
// Tiptap's input-rule plugin short-circuits when the caret's parent is a `code`
// node or adjacent to an inline `code` mark; these tests lock that behaviour in.

type AnyNode = {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string }[]
  content?: AnyNode[]
}

let editor: Editor

beforeEach(() => {
  editor = new Editor({ extensions: baseExtensions, content: '<p></p>' })
})
afterEach(() => editor.destroy())

/**
 * Simulate typing `text` one character at a time through the ProseMirror view so
 * input rules fire exactly as they do for a real user (via `handleTextInput`).
 * Falls back to a plain insert for characters no rule consumes.
 */
function typeText(ed: Editor, text: string) {
  const view = ed.view
  for (const ch of text) {
    const { from, to } = view.state.selection
    // `handleTextInput(view, from, to, text, deflt)` — the 5th arg is the default
    // transaction factory ProseMirror would apply if no rule handles the input.
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)),
    )
    if (!handled) {
      view.dispatch(view.state.tr.insertText(ch, from, to))
    }
  }
}

/** Plain text of the whole doc (concatenated). */
function docText(ed: Editor): string {
  return ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', '\n')
}

function json(ed: Editor): AnyNode {
  return ed.getJSON() as AnyNode
}

function firstBlock(ed: Editor): AnyNode {
  const c = json(ed).content
  if (!c?.[0]) throw new Error('doc has no content')
  return c[0]
}

function findNode(root: AnyNode, type: string): AnyNode | undefined {
  if (root.type === type) return root
  for (const child of root.content ?? []) {
    const hit = findNode(child, type)
    if (hit) return hit
  }
  return undefined
}

/** Position the caret inside a fresh code block for exclusion tests. */
function enterCodeBlock(ed: Editor) {
  ed.chain().setContent('<p></p>').run()
  typeText(ed, '```') // backtick fence...
  typeText(ed, ' ') // ...+ space converts the paragraph to a codeBlock
  expect(firstBlock(ed).type).toBe('codeBlock')
}

// ── 1. Smart typography fires while typing ──────────────────────────────────

describe('smart typography — fires while typing', () => {
  it('straight double quotes become curly “ … ”', () => {
    typeText(editor, 'He said "hi"')
    const t = docText(editor)
    expect(t).toContain('“hi”') // “hi”
    expect(t).not.toContain('"')
  })

  it('straight single quotes / apostrophe become curly ‘ ’', () => {
    typeText(editor, "it's 'go'")
    const t = docText(editor)
    expect(t).toContain('it’s') // it’s
    expect(t).toContain('‘go’') // ‘go’
    expect(t).not.toContain("'")
  })

  it('-- becomes an en dash –', () => {
    typeText(editor, 'pages 9--10')
    expect(docText(editor)).toContain('9–10') // 9–10
  })

  it('--- becomes an em dash — (mid-line, NOT a divider)', () => {
    typeText(editor, 'wait---stop')
    const t = docText(editor)
    expect(t).toContain('wait—stop') // wait—stop
    // A mid-line triple hyphen must not create a horizontal rule.
    expect(findNode(json(editor), 'horizontalRule')).toBeUndefined()
  })

  it('... becomes an ellipsis …', () => {
    typeText(editor, 'wait...')
    expect(docText(editor)).toContain('…') // …
  })

  it('1/2, 1/4, 3/4 become ½ ¼ ¾ (single trigger space preserved, never doubled)', () => {
    typeText(editor, '1/2 1/4 3/4 done')
    const t = docText(editor)
    // The trigger space after each fraction survives exactly once: textInputRule
    // re-appends the matched trailing space itself, so a replacement carrying its
    // own space would yield "½  ¼" — the double-space regression live-verify caught.
    expect(t).toBe('½ ¼ ¾ done')
  })

  it('-> and <- become → and ←', () => {
    typeText(editor, 'a->b')
    typeText(editor, ' c<-d')
    const t = docText(editor)
    expect(t).toContain('→') // →
    expect(t).toContain('←') // ←
  })

  it('(c) (r) (tm) become © ® ™', () => {
    typeText(editor, '(c) (r) (tm)')
    const t = docText(editor)
    expect(t).toContain('©') // ©
    expect(t).toContain('®') // ®
    expect(t).toContain('™') // ™
  })
})

// ── 2. Typography EXCLUSIONS (code block / inline code / math) ───────────────

describe('smart typography — EXCLUDED inside code contexts', () => {
  it('a straight quote inside a code block stays straight', () => {
    enterCodeBlock(editor)
    typeText(editor, 'const s = "x"')
    const code = firstBlock(editor)
    expect(code.type).toBe('codeBlock')
    const raw = code.content?.map((n) => n.text ?? '').join('') ?? ''
    expect(raw).toContain('"x"') // straight quotes preserved
    expect(raw).not.toContain('“')
    expect(raw).not.toContain('”')
  })

  it('dashes / ellipsis inside a code block are NOT transformed', () => {
    enterCodeBlock(editor)
    typeText(editor, 'a--b...c')
    const raw =
      firstBlock(editor)
        .content?.map((n) => n.text ?? '')
        .join('') ?? ''
    expect(raw).toContain('a--b...c')
    expect(raw).not.toContain('–')
    expect(raw).not.toContain('…')
  })

  it('a straight quote adjacent to an inline code mark stays straight', () => {
    // Type an inline-code span via the ` ` input rule, then a quote right after.
    editor.chain().setContent('<p></p>').run()
    typeText(editor, '`x`') // becomes inline code mark on x
    // Caret now sits right after the code-marked "x"; a quote here must not curl.
    typeText(editor, '"')
    const t = docText(editor)
    expect(t).not.toContain('“')
    expect(t).not.toContain('”')
    expect(t).toContain('"')
  })
})

// ── 3. Markdown input-rule audit — each produces the right node/mark ─────────

describe('markdown input rules — present in this editor config', () => {
  it('# + space → heading level 1', () => {
    typeText(editor, '# Title')
    const top = firstBlock(editor)
    expect(top.type).toBe('heading')
    expect(top.attrs?.level).toBe(1)
  })

  it('**bold** → bold mark', () => {
    typeText(editor, '**hi** ')
    expect(JSON.stringify(json(editor))).toContain('"bold"')
  })

  it('*italic* → italic mark', () => {
    typeText(editor, '*hi* ')
    expect(JSON.stringify(json(editor))).toContain('"italic"')
  })

  it('~~strike~~ → strike mark', () => {
    typeText(editor, '~~hi~~ ')
    expect(JSON.stringify(json(editor))).toContain('"strike"')
  })

  it('- + space → bullet list', () => {
    typeText(editor, '- item')
    expect(firstBlock(editor).type).toBe('bulletList')
  })

  it('1. + space → ordered list', () => {
    typeText(editor, '1. item')
    expect(firstBlock(editor).type).toBe('orderedList')
  })

  it('> + space → blockquote', () => {
    typeText(editor, '> quote')
    expect(firstBlock(editor).type).toBe('blockquote')
  })

  it('```lang + space → code block with that language', () => {
    typeText(editor, '```python ')
    const top = firstBlock(editor)
    expect(top.type).toBe('codeBlock')
    expect(top.attrs?.language).toBe('python')
  })

  it('--- at line start → horizontal rule (divider WINS over em dash)', () => {
    typeText(editor, '---')
    expect(findNode(json(editor), 'horizontalRule')).toBeDefined()
    // and it must NOT have been swallowed into an em dash first
    expect(docText(editor)).not.toContain('—')
  })

  it('*** (+ space) at line start → horizontal rule', () => {
    // The base HorizontalRule rule fires bare `---`, but `*** ` / `___ ` require a
    // trailing space (so a `***bold***` start is never mis-fired) — standard
    // markdown. We honour that and type the space.
    typeText(editor, '*** ')
    expect(findNode(json(editor), 'horizontalRule')).toBeDefined()
  })

  it('[] + space → unchecked task item', () => {
    typeText(editor, '[] task')
    expect(findNode(json(editor), 'taskItem')).toBeDefined()
    expect(findNode(json(editor), 'taskItem')?.attrs?.checked).toBe(false)
  })

  it('[ ] + space → unchecked task item', () => {
    typeText(editor, '[ ] task')
    const item = findNode(json(editor), 'taskItem')
    expect(item).toBeDefined()
    expect(item?.attrs?.checked).toBe(false)
  })

  it('[x] + space → checked task item', () => {
    typeText(editor, '[x] task')
    const item = findNode(json(editor), 'taskItem')
    expect(item).toBeDefined()
    expect(item?.attrs?.checked).toBe(true)
  })
})
