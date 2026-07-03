// @vitest-environment jsdom
/**
 * v0.2.10 — FULL paste pipeline tests against the real production schema.
 *
 * Uses baseExtensions (the exact extension set the live editor loads, which
 * includes SmartPasteExtension itself) and drives paste through ProseMirror's
 * public test entry points view.pasteHTML / view.pasteText — this exercises
 * transformPastedHTML → HTML parse → handlePaste exactly like a real paste,
 * then asserts the RESULTING PROSEMIRROR DOC STRUCTURE.
 */
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

// jsdom 29 does not implement ClipboardEvent; prosemirror-view's pasteHTML /
// pasteText construct one internally (`new ClipboardEvent("paste")`). A minimal
// Event subclass is enough — PM only uses it as the event passed to paste props.
// An optional `clipboardData` passthrough lets tests exercise handlePaste paths
// that read event.clipboardData.getData(...).
class FakeClipboardEvent extends Event {
  clipboardData: { getData(type: string): string } | null
  constructor(type: string, init?: EventInit & { clipboardData?: { getData(t: string): string } }) {
    super(type, init)
    this.clipboardData = init?.clipboardData ?? null
  }
}
;(globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = FakeClipboardEvent

type AnyNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: AnyNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}
type DocJson = AnyNode

/** Walk the JSON tree and find the first node of a given type. */
function findNode(root: AnyNode, type: string): AnyNode | undefined {
  if (root.type === type) return root
  for (const child of root.content ?? []) {
    const found = findNode(child, type)
    if (found) return found
  }
  return undefined
}

/** Count all nodes of a given type in the tree. */
function countNodes(root: AnyNode, type: string): number {
  let count = root.type === type ? 1 : 0
  for (const child of root.content ?? []) {
    count += countNodes(child, type)
  }
  return count
}

/** Collect the concatenated text of a node subtree. */
function textOf(node: AnyNode | undefined): string {
  if (!node) return ''
  let out = node.text ?? ''
  for (const child of node.content ?? []) out += textOf(child)
  return out
}

/** Find the first text node whose text contains `needle`; return its marks. */
function marksOfText(root: AnyNode, needle: string): string[] {
  if (root.text?.includes(needle)) return (root.marks ?? []).map((m) => m.type)
  for (const child of root.content ?? []) {
    const found = marksOfText(child, needle)
    if (found.length > 0 || (child.text?.includes(needle) ?? false)) return found
  }
  return []
}

const WORD_FRAGMENT = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<body lang="EN-US">
<h1 class="MsoHeading1" style="mso-style-name:heading1;color:#1F497D">Quarterly Report</h1>
<p class="MsoNormal" style="color:#000" lang="EN-US">Intro with <b>bold</b> and <span style="font-style:italic;color:red">italic red</span>.</p>
<p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>First item</p>
<p class="MsoListParagraphCxSpMiddle" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.</span>Second item</p>
<p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">3.</span>Third item</p>
</body></html>`

const GDOCS_FRAGMENT = `<meta charset="utf-8"><b id="docs-internal-guid-xyz" style="font-weight:normal">
<h2 dir="ltr"><span style="font-size:16pt;color:#0b57d0">Section Title</span></h2>
<p dir="ltr"><span style="font-weight:700;color:#c00">bold red</span><span> then </span><span style="font-style:italic">italic text</span></p>
</b>`

const WEB_FRAGMENT = `<html><body>
<p>Read <a href="https://example.com/post?utm_source=x">the post</a> now.</p>
<img src="https://example.com/pic.png" alt="pic">
<pre><code class="language-js">const x = 1;</code></pre>
<table><tbody>
<tr><th colspan="2">Wide header</th></tr>
<tr><td>A1</td><td rowspan="2">Tall</td></tr>
<tr><td>A2</td></tr>
</tbody></table>
</body></html>`

let editor: Editor

beforeEach(() => {
  editor = new Editor({ extensions: baseExtensions, content: '<p></p>' })
})

afterEach(() => {
  editor.destroy()
})

describe('paste pipeline — Word fixture → PM doc structure', () => {
  beforeEach(() => {
    editor.view.pasteHTML(WORD_FRAGMENT)
  })

  it('produces a level-1 heading node', () => {
    const doc = editor.getJSON() as DocJson
    const heading = findNode(doc, 'heading')
    expect(heading).toBeDefined()
    expect(heading?.attrs?.level).toBe(1)
    expect(textOf(heading)).toContain('Quarterly Report')
  })

  it('produces a real ordered list with three items', () => {
    const doc = editor.getJSON() as DocJson
    const list = findNode(doc, 'orderedList')
    expect(list).toBeDefined()
    expect(countNodes(doc, 'listItem')).toBe(3)
    expect(textOf(list)).toContain('First item')
    expect(textOf(list)).toContain('Third item')
  })

  it('carries bold and italic as real marks', () => {
    const doc = editor.getJSON() as DocJson
    expect(marksOfText(doc, 'bold')).toContain('bold')
    expect(marksOfText(doc, 'italic red')).toContain('italic')
  })

  it('leaks no Word junk into the doc (no mso/Mso classes or color values)', () => {
    const json = JSON.stringify(editor.getJSON())
    expect(json).not.toMatch(/mso-|Mso/)
    // The color VALUE from the Word style must not survive ("red" as content
    // text is fine — 'italic red' is the fixture's visible text).
    expect(json).not.toMatch(/#1F497D/i)
    expect(json).not.toMatch(/"color"/)
    expect(json).not.toMatch(/style=/)
  })
})

describe('paste pipeline — GDocs fixture → PM doc structure', () => {
  beforeEach(() => {
    editor.view.pasteHTML(GDOCS_FRAGMENT)
  })

  it('produces a level-2 heading node with clean text', () => {
    const doc = editor.getJSON() as DocJson
    const heading = findNode(doc, 'heading')
    expect(heading).toBeDefined()
    expect(heading?.attrs?.level).toBe(2)
    expect(textOf(heading)).toContain('Section Title')
  })

  it('maps style-only bold/italic to real marks and drops colors', () => {
    const doc = editor.getJSON() as DocJson
    expect(marksOfText(doc, 'bold red')).toContain('bold')
    expect(marksOfText(doc, 'italic text')).toContain('italic')
    const json = JSON.stringify(doc)
    expect(json).not.toMatch(/#c00|#0b57d0/i)
    // The whole doc must not have been swallowed into a bold wrapper (the
    // docs-internal-guid <b> is unwrapped, not kept as a mark on everything).
    expect(marksOfText(doc, ' then ')).not.toContain('bold')
  })
})

describe('paste pipeline — web fixture → PM doc structure', () => {
  beforeEach(() => {
    editor.view.pasteHTML(WEB_FRAGMENT)
  })

  it('keeps hyperlinks as link marks with untouched hrefs', () => {
    const doc = editor.getJSON() as DocJson
    const marks = marksOfText(doc, 'the post')
    expect(marks).toContain('link')
    const json = JSON.stringify(doc)
    expect(json).toContain('https://example.com/post?utm_source=x')
  })

  it('keeps images as image nodes with their src', () => {
    const doc = editor.getJSON() as DocJson
    const img = findNode(doc, 'image')
    expect(img).toBeDefined()
    expect(img?.attrs?.src).toBe('https://example.com/pic.png')
  })

  it('maps <pre><code> to a real codeBlock node', () => {
    const doc = editor.getJSON() as DocJson
    const code = findNode(doc, 'codeBlock')
    expect(code).toBeDefined()
    expect(textOf(code)).toContain('const x = 1;')
  })

  it('maps the table to real table nodes with colspan/rowspan', () => {
    const doc = editor.getJSON() as DocJson
    expect(findNode(doc, 'table')).toBeDefined()
    const header = findNode(doc, 'tableHeader')
    expect(header?.attrs?.colspan).toBe(2)
    // find the rowspan=2 cell
    let rowspanCell: AnyNode | undefined
    const walk = (n: AnyNode): void => {
      if (n.type === 'tableCell' && n.attrs?.rowspan === 2) rowspanCell = n
      for (const c of n.content ?? []) walk(c)
    }
    walk(doc)
    expect(rowspanCell).toBeDefined()
    expect(textOf(rowspanCell)).toContain('Tall')
  })
})

describe('paste pipeline — code block stays RAW', () => {
  beforeEach(() => {
    editor.commands.setContent('<pre><code>seed</code></pre>')
    // Place the caret inside the code block text.
    editor.commands.setTextSelection(3)
    expect(editor.isActive('codeBlock')).toBe(true)
  })

  it('pasting Word HTML into a code block never creates headings/lists', () => {
    editor.view.pasteHTML(WORD_FRAGMENT)
    const doc = editor.getJSON() as DocJson
    expect(countNodes(doc, 'heading')).toBe(0)
    expect(countNodes(doc, 'orderedList')).toBe(0)
    expect(countNodes(doc, 'bulletList')).toBe(0)
    // Still exactly one code block, and the pasted text landed inside it.
    expect(countNodes(doc, 'codeBlock')).toBe(1)
    expect(textOf(findNode(doc, 'codeBlock'))).toContain('Quarterly Report')
  })

  it('pasting markdown-looking text into a code block stays literal', () => {
    // Pass a clipboardData-carrying event so the SmartPaste handlePaste markdown
    // branch is actually reachable — the code-block guard must keep it raw.
    const text = '# Heading\n- item one'
    const evt = new FakeClipboardEvent('paste', {
      clipboardData: { getData: (t: string) => (t === 'text/plain' ? text : '') },
    })
    editor.view.pasteText(text, evt as unknown as ClipboardEvent)
    const doc = editor.getJSON() as DocJson
    expect(countNodes(doc, 'heading')).toBe(0)
    expect(countNodes(doc, 'bulletList')).toBe(0)
    expect(countNodes(doc, 'codeBlock')).toBe(1)
    expect(textOf(findNode(doc, 'codeBlock'))).toContain('# Heading')
  })
})

describe('paste pipeline — markdown interception control (NOT in a code block)', () => {
  it('the same markdown paste in a paragraph DOES produce heading + list', () => {
    // Positive control for the code-block guard test above: prove the markdown
    // interception fires through this simulated paste path when NOT in code.
    const text = '# Heading\n\n- item one\n- item two'
    const evt = new FakeClipboardEvent('paste', {
      clipboardData: { getData: (t: string) => (t === 'text/plain' ? text : '') },
    })
    editor.view.pasteText(text, evt as unknown as ClipboardEvent)
    const doc = editor.getJSON() as DocJson
    expect(countNodes(doc, 'heading')).toBe(1)
    expect(countNodes(doc, 'bulletList')).toBe(1)
    expect(countNodes(doc, 'listItem')).toBe(2)
  })
})

describe('paste pipeline — internal Parchment clipboard keeps fidelity', () => {
  it('data-pm-slice HTML keeps its marks (round-trip fidelity)', () => {
    const internal =
      '<meta charset="utf-8"><p data-pm-slice="1 1 []">plain <strong>strong bit</strong> tail</p>'
    editor.view.pasteHTML(internal)
    const doc = editor.getJSON() as DocJson
    expect(marksOfText(doc, 'strong bit')).toContain('bold')
    expect(textOf(doc)).toContain('plain')
    expect(textOf(doc)).toContain('tail')
  })
})
