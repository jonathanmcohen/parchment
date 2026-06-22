// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

// F3: LOSSLESS canonical markdown. Parchment's custom blocks (pageBreak,
// sectionBreak, toc, formula/merge/shading tables) serialize to fenced
// `parchment:<kind>` code blocks and reconstruct to the exact PM node. This
// suite is the core guarantee: serialize → assert fence → parse → deep-equal.
//
// Like serialize.ts / parse.ts, this runs in the node env with NO editor graph.

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const text = (t: string) => ({ type: 'text', text: t })

/** Depth-first find of the first node matching the predicate. */
function find(node: Node | undefined, pred: (n: Node) => boolean): Node | undefined {
  if (!node) return undefined
  if (pred(node)) return node
  for (const child of node.content ?? []) {
    const hit = find(child, pred)
    if (hit) return hit
  }
  return undefined
}

/** Serialize a doc, then parse it back to JSON. */
function roundTrip(document: unknown): Node {
  return markdownToJson(serializeMarkdown(document)) as Node
}

describe('F3 — lossless custom-block round-trip', () => {
  it('pageBreak round-trips (node identical)', () => {
    const original = { type: 'pageBreak' }
    const md = serializeMarkdown(doc(original))
    expect(md).toContain('```parchment:pagebreak')

    const back = roundTrip(doc(original))
    const node = find(back, (n) => n.type === 'pageBreak')
    expect(node).toBeDefined()
    expect(node).toEqual(original)
  })

  it('sectionBreak with all four attrs round-trips with attrs intact', () => {
    const original = {
      type: 'sectionBreak',
      attrs: {
        headerText: 'My Header',
        footerText: 'My Footer',
        pageNumberFormat: 'i',
        pageNumberPosition: 'right',
      },
    }
    const md = serializeMarkdown(doc(original))
    expect(md).toContain('```parchment:section')

    const back = roundTrip(doc(original))
    const node = find(back, (n) => n.type === 'sectionBreak')
    expect(node).toBeDefined()
    expect(node?.attrs).toEqual(original.attrs)
  })

  it('toc round-trips (full node deep-equals, showPageNumbers:true)', () => {
    const original = { type: 'toc', attrs: { showPageNumbers: true } }
    const md = serializeMarkdown(doc(original))
    expect(md).toContain('```parchment:toc')

    const back = roundTrip(doc(original))
    const node = find(back, (n) => n.type === 'toc')
    expect(node).toBeDefined()
    // Full-node deep equality, not just attrs.
    expect(node).toEqual(original)
  })

  it('toc with default attrs (showPageNumbers:false) round-trips (full node deep-equals)', () => {
    const original = { type: 'toc', attrs: { showPageNumbers: false } }
    const md = serializeMarkdown(doc(original))
    expect(md).toContain('```parchment:toc')

    const back = roundTrip(doc(original))
    const node = find(back, (n) => n.type === 'toc')
    expect(node).toBeDefined()
    expect(node).toEqual(original)
  })

  it('attr-less toc {type:toc} reconstructs to the schema default (showPageNumbers:false)', () => {
    // An attr-less toc must backfill the schema default on parse, so it ends up
    // deep-equal to a real editor toc node (which always carries showPageNumbers).
    const attrLess = { type: 'toc' }
    const defaulted = { type: 'toc', attrs: { showPageNumbers: false } }

    // serialize is symmetric: {type:'toc'} and the defaulted node emit identically.
    expect(serializeMarkdown(doc(attrLess))).toBe(serializeMarkdown(doc(defaulted)))

    const back = roundTrip(doc(attrLess))
    const node = find(back, (n) => n.type === 'toc')
    expect(node).toBeDefined()
    expect(node).toEqual(defaulted)
  })

  it('a table WITH a formula cell round-trips via parchment:table (formula preserved)', () => {
    const cell = (value: string, formula?: string): Node => ({
      type: 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth: null, formula: formula ?? null },
      content: [p(text(value)) as Node],
    })
    const original = {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('1'), cell('2')] },
        { type: 'tableRow', content: [cell('3'), cell('3', '=SUM(A1:A2)')] },
      ],
    }
    const md = serializeMarkdown(doc(original))
    expect(md).toContain('```parchment:table')

    const back = roundTrip(doc(original))
    const node = find(back, (n) => n.type === 'table')
    expect(node).toBeDefined()
    // Structural equality: the full table node survives intact.
    expect(node).toEqual(original)
    // The formula attr specifically is preserved on the right cell.
    const formulaCell = find(node, (n) => n.attrs?.formula === '=SUM(A1:A2)')
    expect(formulaCell).toBeDefined()
  })

  it('a table with a merged cell (colspan > 1) round-trips via parchment:table', () => {
    const original = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 2, rowspan: 1, colwidth: null, formula: null },
              content: [p(text('merged')) as Node],
            },
          ],
        },
      ],
    }
    const md = serializeMarkdown(doc(original))
    expect(md).toContain('```parchment:table')

    const back = roundTrip(doc(original))
    const node = find(back, (n) => n.type === 'table')
    expect(node).toEqual(original)
  })

  it('a MIXED doc round-trips: custom nodes survive and serialize is idempotent', () => {
    const heading = { type: 'heading', attrs: { level: 1 }, content: [text('Title')] }
    const para = p(text('Intro paragraph'))
    const pageBreak = { type: 'pageBreak' }
    const sectionBreak = {
      type: 'sectionBreak',
      attrs: {
        headerText: 'Chapter Two',
        footerText: '',
        pageNumberFormat: '1',
        pageNumberPosition: 'center',
      },
    }
    const list = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p(text('alpha'))] },
        { type: 'listItem', content: [p(text('beta'))] },
      ],
    }
    const document = doc(heading, para, pageBreak, sectionBreak, list)

    const md1 = serializeMarkdown(document)
    // The custom fences are present.
    expect(md1).toContain('```parchment:pagebreak')
    expect(md1).toContain('```parchment:section')

    // serialize → parse → serialize is byte-identical (idempotent).
    const md2 = serializeMarkdown(markdownToJson(md1))
    expect(md2).toBe(md1)

    // The custom nodes survive a parse.
    const back = markdownToJson(md1) as Node
    expect(find(back, (n) => n.type === 'pageBreak')).toBeDefined()
    expect(find(back, (n) => n.type === 'sectionBreak')).toBeDefined()
    expect(find(back, (n) => n.type === 'heading')).toBeDefined()
    expect(find(back, (n) => n.type === 'bulletList')).toBeDefined()
  })

  it('malformed parchment fence body does NOT throw and degrades to a code/plain node', () => {
    const md = '```parchment:section\n{not json\n```'
    expect(() => markdownToJson(md)).not.toThrow()

    const back = markdownToJson(md) as Node
    // It did NOT become a sectionBreak — it degraded to a plain codeBlock.
    expect(find(back, (n) => n.type === 'sectionBreak')).toBeUndefined()
    const code = find(back, (n) => n.type === 'codeBlock')
    expect(code).toBeDefined()
    expect(code?.attrs?.language).toBe('parchment:section')
  })

  it('a parchment:table fence whose body is not a table degrades to a codeBlock', () => {
    const md = '```parchment:table\n{"type":"paragraph"}\n```'
    const back = markdownToJson(md) as Node
    expect(find(back, (n) => n.type === 'table')).toBeUndefined()
    expect(find(back, (n) => n.type === 'codeBlock')).toBeDefined()
  })

  it('an empty-body section fence degrades to default attrs without throwing', () => {
    const md = '```parchment:section\n```'
    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'sectionBreak')
    expect(node).toBeDefined()
    expect(node?.attrs).toEqual({
      headerText: '',
      footerText: '',
      pageNumberFormat: '1',
      pageNumberPosition: 'center',
    })
  })

  // G8a: figure (image with caption + refId) round-trip via parchment:figure.
  it('an image with caption and refId round-trips via parchment:figure (all attrs preserved)', () => {
    const original = {
      type: 'image',
      attrs: {
        src: 'https://example.com/photo.jpg',
        alt: 'A sunset',
        caption: 'The sunset over the bay',
        refId: 'fig-abc-123',
        position: 'inline',
        width: null,
        height: null,
        lockAspect: true,
      },
    }
    const md = serializeMarkdown(doc(original))
    expect(md).toContain('```parchment:figure')
    expect(md).toContain('fig-abc-123')
    expect(md).toContain('The sunset over the bay')

    const back = roundTrip(doc(original))
    const node = find(back, (n) => n.type === 'image')
    expect(node).toBeDefined()
    expect(node?.attrs?.src).toBe('https://example.com/photo.jpg')
    expect(node?.attrs?.alt).toBe('A sunset')
    expect(node?.attrs?.caption).toBe('The sunset over the bay')
    expect(node?.attrs?.refId).toBe('fig-abc-123')
    expect(node?.attrs?.position).toBe('inline')
    expect(node?.attrs?.lockAspect).toBe(true)
  })

  // G8a: table with caption + refId round-trip via parchment:table (attrs key carries them).
  it('a table with caption and refId round-trips via parchment:table (attrs preserved)', () => {
    const original = {
      type: 'table',
      attrs: { refId: 'tbl-xyz-456', caption: 'Summary statistics' },
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: null, formula: null },
              content: [p(text('value')) as Node],
            },
          ],
        },
      ],
    }
    const md = serializeMarkdown(doc(original))
    expect(md).toContain('```parchment:table')
    expect(md).toContain('tbl-xyz-456')
    expect(md).toContain('Summary statistics')

    const back = roundTrip(doc(original))
    const node = find(back, (n) => n.type === 'table')
    expect(node).toBeDefined()
    expect(node?.attrs?.refId).toBe('tbl-xyz-456')
    expect(node?.attrs?.caption).toBe('Summary statistics')
  })

  // G8a: mathBlock with refId round-trip via parchment:equation.
  it('a mathBlock with refId round-trips via parchment:equation (latex + refId preserved)', () => {
    const original = {
      type: 'mathBlock',
      attrs: { latex: 'E = mc^2', refId: 'eq-energy-001' },
    }
    const md = serializeMarkdown(doc(original))
    expect(md).toContain('```parchment:equation')
    expect(md).toContain('E = mc^2')
    expect(md).toContain('eq-energy-001')

    const back = roundTrip(doc(original))
    const node = find(back, (n) => n.type === 'mathBlock')
    expect(node).toBeDefined()
    expect(node?.attrs?.latex).toBe('E = mc^2')
    expect(node?.attrs?.refId).toBe('eq-energy-001')
  })
})
