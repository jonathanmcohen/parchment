import { Schema } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import {
  type ChangedRange,
  collectAutoDetectTargets,
} from '@/lib/editor/extensions/code-block-shiki'
import { detectLanguage } from '@/lib/editor/shiki/auto-detect'

// A minimal ProseMirror schema with a codeBlock node carrying a `language`
// attribute — enough to exercise collectAutoDetectTargets without a live editor.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    codeBlock: {
      group: 'block',
      content: 'text*',
      code: true,
      attrs: { language: { default: null } },
    },
    text: {},
  },
})

function codeBlock(text: string, language: string | null = null) {
  return schema.nodes.codeBlock.create({ language }, text ? schema.text(text) : null)
}

function para(text: string) {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : null)
}

/** Build a doc and return [doc, positionOfNthBlock]. */
function docOf(...nodes: ReturnType<typeof codeBlock>[]) {
  return schema.nodes.doc.create(null, nodes)
}

/** Position of the i-th top-level child node in a doc (0-indexed). */
function childPos(doc: ReturnType<typeof docOf>, index: number): number {
  let pos = 0
  doc.forEach((_node, offset, i) => {
    if (i === index) pos = offset
  })
  return pos
}

describe('collectAutoDetectTargets', () => {
  it('returns a code block whose text changed and language is null', () => {
    const doc = docOf(codeBlock('const x = 1\nconsole.log(x)', null))
    const pos = childPos(doc, 0)
    const node = doc.child(0)
    // A changed range overlapping the block (the whole block was edited).
    const ranges: ChangedRange[] = [{ from: pos + 1, to: pos + node.nodeSize - 1 }]

    const targets = collectAutoDetectTargets(doc, ranges)

    expect(targets).toHaveLength(1)
    expect(targets[0]?.pos).toBe(pos)
    expect(targets[0]?.text).toBe('const x = 1\nconsole.log(x)')
  })

  it('does NOT return an untouched code block (no overlapping changed range)', () => {
    // Two blocks; only the SECOND was edited. The first must never be a candidate.
    const doc = docOf(
      codeBlock('untouched from disk', null),
      codeBlock('edited content here', null),
    )
    const secondPos = childPos(doc, 1)
    const secondNode = doc.child(1)
    const ranges: ChangedRange[] = [
      { from: secondPos + 1, to: secondPos + secondNode.nodeSize - 1 },
    ]

    const targets = collectAutoDetectTargets(doc, ranges)

    expect(targets).toHaveLength(1)
    expect(targets[0]?.pos).toBe(secondPos)
    // The untouched block's position must NOT appear.
    const firstPos = childPos(doc, 0)
    expect(targets.some((t) => t.pos === firstPos)).toBe(false)
  })

  it('does NOT return a block that already has a concrete language', () => {
    const doc = docOf(codeBlock('const x = 1\nconsole.log(x)', 'typescript'))
    const pos = childPos(doc, 0)
    const node = doc.child(0)
    const ranges: ChangedRange[] = [{ from: pos + 1, to: pos + node.nodeSize - 1 }]

    const targets = collectAutoDetectTargets(doc, ranges)

    expect(targets).toHaveLength(0)
  })

  it('returns nothing when there are no changed ranges', () => {
    const doc = docOf(codeBlock('const x = 1\nconsole.log(x)', null))
    expect(collectAutoDetectTargets(doc, [])).toHaveLength(0)
  })

  it('ignores a paragraph that changed (only code blocks are candidates)', () => {
    const doc = docOf(para('hello world'), codeBlock('const x = 1', null))
    const paraPos = childPos(doc, 0)
    const paraNode = doc.child(0)
    const ranges: ChangedRange[] = [{ from: paraPos + 1, to: paraPos + paraNode.nodeSize - 1 }]

    const targets = collectAutoDetectTargets(doc, ranges)

    expect(targets).toHaveLength(0)
  })
})

describe('detectLanguage (auto-detect codepath)', () => {
  it('detects a JavaScript snippet as javascript', () => {
    const code =
      'export function fib(n) {\n  if (n < 2) return n\n  return fib(n - 1) + fib(n - 2)\n}\nconst result = fib(10)\nconsole.log(result)'
    const { language } = detectLanguage(code)
    expect(language).toBe('javascript')
  })
})
