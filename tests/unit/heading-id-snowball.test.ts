// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

// v0.2.9 #2 — heading-id snowball fix.
//
// BUG (observed 4 layers deep on the prod release-notes doc): serialize.ts appends
// ` <!-- id:<slug> -->` to a heading, but parse.ts's HEADING_ID_RE only stripped ONE
// TRAILING comment. Leftover comments stayed in the heading TEXT; the editor's
// HeadingId re-slugged from the polluted text and serialize appended another comment,
// so the comments SNOWBALLED across disk<->DB round trips, e.g.:
//   # Release notes <!-- id:release-notes --> <!-- id:release-notes-idrelease-notes -->
//                   <!-- id:release-notes-idrelease-notes-idrelease-notes-idrelease-notes -->
//
// FIX: parse.ts strips ALL `<!-- id:... -->` occurrences from heading text (anywhere,
// repeated/nested) and derives attrs.id from the (first) captured id; serialize.ts
// emits exactly one. serialize(parse(x)) must be idempotent from the first pass and
// the heading's stored TEXT must contain no comment residue.

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
}

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const heading = (level: number, id: string, txt: string) => ({
  type: 'heading',
  attrs: { level, id },
  content: [{ type: 'text', text: txt }],
})

/** Text content of the first heading node. */
function firstHeadingText(d: unknown): string {
  const content = (d as { content?: Node[] }).content ?? []
  const h = content.find((n) => n.type === 'heading')
  return (h?.content ?? []).map((c) => c.text ?? '').join('')
}
function firstHeadingId(d: unknown): unknown {
  const content = (d as { content?: Node[] }).content ?? []
  const h = content.find((n) => n.type === 'heading')
  return h?.attrs?.id
}

describe('#2 heading-id snowball', () => {
  it('parse strips a SINGLE trailing id comment and restores attrs.id (regression baseline)', () => {
    const md = '# Release notes <!-- id:release-notes -->\n'
    const parsed = markdownToJson(md)
    expect(firstHeadingText(parsed)).toBe('Release notes')
    expect(firstHeadingId(parsed)).toBe('release-notes')
  })

  it('parse strips ALL id comments from heading text (multi-layer / nested)', () => {
    // Exactly the prod evidence: three nested id comments.
    const md =
      '# Release notes <!-- id:release-notes --> <!-- id:release-notes-idrelease-notes --> <!-- id:release-notes-idrelease-notes-idrelease-notes-idrelease-notes -->\n'
    const parsed = markdownToJson(md)
    // Heading text must be CLEAN — no comment residue at all.
    expect(firstHeadingText(parsed)).toBe('Release notes')
    // The id derives from the FIRST (canonical) comment, not a polluted one.
    expect(firstHeadingId(parsed)).toBe('release-notes')
  })

  it('serialize emits exactly one id comment', () => {
    const d = doc(heading(1, 'release-notes', 'Release notes'))
    const md = serializeMarkdown(d)
    const matches = md.match(/<!--\s*id:/g) ?? []
    expect(matches.length).toBe(1)
    expect(md.trim()).toBe('# Release notes <!-- id:release-notes -->')
  })

  it('serialize∘parse is idempotent from the first pass (byte-identical thereafter)', () => {
    const start = doc(heading(1, 'release-notes', 'Release notes'))
    let md = serializeMarkdown(start)
    const md1 = md
    // Apply serialize∘parse 5 more times; from md1 onward it must be byte-identical.
    for (let i = 0; i < 5; i++) {
      md = serializeMarkdown(markdownToJson(md))
      expect(md).toBe(md1)
    }
  })

  it('a polluted heading self-repairs on its next parse (all layers stripped, single id)', () => {
    const polluted =
      '# Release notes <!-- id:release-notes --> <!-- id:release-notes-idrelease-notes -->\n'
    const parsed = markdownToJson(polluted)
    // Reserialize → exactly one clean comment.
    const md = serializeMarkdown(parsed)
    expect(md.trim()).toBe('# Release notes <!-- id:release-notes -->')
    // And it's stable forever after.
    expect(serializeMarkdown(markdownToJson(md))).toBe(md)
  })

  it('handles multiple headings each with their own id, no cross-pollution', () => {
    const d = doc(heading(1, 'intro', 'Intro'), heading(2, 'details', 'Details'))
    const md = serializeMarkdown(d)
    const round = serializeMarkdown(markdownToJson(md))
    expect(round).toBe(md)
    const parsed = markdownToJson(md)
    const headings = ((parsed as { content?: Node[] }).content ?? []).filter(
      (n) => n.type === 'heading',
    )
    expect(headings.map((h) => (h.content ?? []).map((c) => c.text ?? '').join(''))).toEqual([
      'Intro',
      'Details',
    ])
    expect(headings.map((h) => h.attrs?.id)).toEqual(['intro', 'details'])
  })
})
