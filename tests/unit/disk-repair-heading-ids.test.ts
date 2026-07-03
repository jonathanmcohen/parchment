// @vitest-environment node
//
// v0.2.10 — one-shot disk-repair sweep for legacy heading-id snowball pollution.
//
// v0.2.9 fixed parse.ts (strips ALL `<!-- id:… -->` comments, takes the first) and
// serialize.ts (idempotent), so a polluted doc self-heals ON ITS NEXT SYNC. But a
// doc that never syncs again stays polluted on disk forever, and its DB heading TEXT
// may still carry the literal comment garbage from an import done under the OLD code.
//
// These are the PURE-LOGIC tests for the SURGICAL repair transform (no DB, no fs):
// cleanHeadingIdResidue must strip every snowballed id comment from ProseMirror
// heading text nodes — and touch NOTHING else (marks, unknown attrs, non-heading
// nodes, fidelity-fragile nodes like footnoteRef are preserved by identity). The
// canonical disk projection is serializeMarkdown(cleaned) — consuming the FIXED
// serializer, never re-implementing it. The DB/disk plumbing + flag gating +
// quiescence guard + per-doc error isolation are covered in the integration suite.

import { describe, expect, it } from 'vitest'
import { cleanHeadingIdResidue } from '@/lib/disk/repair-heading-ids'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
  marks?: unknown[]
}

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const heading = (level: number, id: string, txt: string) => ({
  type: 'heading',
  attrs: { level, id },
  content: [{ type: 'text', text: txt }],
})
/** A heading whose visible TEXT was polluted by the old-code import path (no id attr). */
const pollutedHeading = (level: number, text: string) => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
})

function firstHeading(d: unknown): Node | undefined {
  const content = (d as { content?: Node[] }).content ?? []
  return content.find((n) => n.type === 'heading')
}
function headingText(h: Node | undefined): string {
  return (h?.content ?? []).map((c) => c.text ?? '').join('')
}

// The exact prod evidence: a heading snowballed multiple id-comment layers deep.
const POLLUTED_TEXT =
  'Release notes <!-- id:release-notes --> <!-- id:release-notes-idrelease-notes --> <!-- id:release-notes-idrelease-notes-idrelease-notes-idrelease-notes -->'
const CANONICAL_MD = '# Release notes <!-- id:release-notes -->\n'

describe('cleanHeadingIdResidue — surgical strip', () => {
  it('strips multi-layer snowballed residue from a heading text node', () => {
    const { cleaned, changed } = cleanHeadingIdResidue(doc(pollutedHeading(1, POLLUTED_TEXT)))
    expect(changed).toBe(true)
    const h = firstHeading(cleaned)
    expect(headingText(h)).toBe('Release notes')
    // The FIRST id is canonical (parse.ts rule) and lands in attrs.id.
    expect(h?.attrs?.id).toBe('release-notes')
    expect(h?.attrs?.level).toBe(1)
  })

  it('keeps an existing non-empty attrs.id authoritative over residue ids', () => {
    const polluted = {
      type: 'heading',
      attrs: { level: 2, id: 'editor-set-id' },
      content: [{ type: 'text', text: 'Setup <!-- id:setup --> <!-- id:setup-idsetup -->' }],
    }
    const { cleaned, changed } = cleanHeadingIdResidue(doc(polluted))
    expect(changed).toBe(true)
    const h = firstHeading(cleaned)
    expect(headingText(h)).toBe('Setup')
    expect(h?.attrs?.id).toBe('editor-set-id')
  })

  it('is a no-op on clean content — changed=false and the SAME object is returned', () => {
    const clean = doc(heading(1, 'release-notes', 'Release notes'), {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Body.' }],
    })
    const { cleaned, changed } = cleanHeadingIdResidue(clean)
    expect(changed).toBe(false)
    expect(cleaned).toBe(clean) // object identity — proves zero rebuild for clean docs
  })

  it('is idempotent — cleaning the cleaned tree changes nothing', () => {
    const first = cleanHeadingIdResidue(doc(pollutedHeading(1, POLLUTED_TEXT)))
    const second = cleanHeadingIdResidue(first.cleaned)
    expect(second.changed).toBe(false)
    expect(second.cleaned).toBe(first.cleaned)
  })

  it('preserves marks on heading text and non-text inline nodes', () => {
    const polluted = {
      type: 'heading',
      attrs: { level: 1 },
      content: [
        { type: 'text', text: 'Bold ', marks: [{ type: 'bold' }] },
        { type: 'mathInline', attrs: { latex: 'x^2' } },
        { type: 'text', text: ' tail <!-- id:bold-tail -->' },
      ],
    }
    const { cleaned, changed } = cleanHeadingIdResidue(doc(polluted))
    expect(changed).toBe(true)
    const h = firstHeading(cleaned)
    expect(h?.content?.[0]).toEqual({ type: 'text', text: 'Bold ', marks: [{ type: 'bold' }] })
    expect(h?.content?.[1]).toEqual({ type: 'mathInline', attrs: { latex: 'x^2' } })
    expect(h?.content?.[2]).toEqual({ type: 'text', text: ' tail' })
    expect(h?.attrs?.id).toBe('bold-tail')
  })

  it('preserves UNKNOWN heading attrs (only id may be added)', () => {
    const polluted = {
      type: 'heading',
      attrs: { level: 3, textAlign: 'center' },
      content: [{ type: 'text', text: 'Centered <!-- id:centered -->' }],
    }
    const { cleaned } = cleanHeadingIdResidue(doc(polluted))
    const h = firstHeading(cleaned)
    expect(h?.attrs).toEqual({ level: 3, textAlign: 'center', id: 'centered' })
  })

  it('NEVER touches fidelity-fragile non-heading nodes (footnoteRef, footnotes block)', () => {
    const footnotePara = {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'See note' },
        { type: 'footnoteRef', attrs: { number: 1 } },
      ],
    }
    const footnotes = {
      type: 'footnotes',
      content: [{ type: 'footnoteItem', content: [{ type: 'paragraph' }] }],
    }
    const tree = doc(
      pollutedHeading(1, 'T <!-- id:t --> <!-- id:t-idt -->'),
      footnotePara,
      footnotes,
    )
    const { cleaned, changed } = cleanHeadingIdResidue(tree)
    expect(changed).toBe(true)
    const outContent = (cleaned as { content: Node[] }).content
    // The paragraph + footnotes nodes come through by IDENTITY — provably untouched.
    expect(outContent[1]).toBe(footnotePara)
    expect(outContent[2]).toBe(footnotes)
  })

  it('leaves comment-like strings in NON-heading text alone (user content)', () => {
    const para = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'literal <!-- id:not-pollution --> in a paragraph' }],
    }
    const tree = doc(para)
    const { cleaned, changed } = cleanHeadingIdResidue(tree)
    expect(changed).toBe(false)
    expect(cleaned).toBe(tree)
  })

  it('cleans headings nested inside containers (blockquote)', () => {
    const tree = doc({
      type: 'blockquote',
      content: [pollutedHeading(2, 'Quoted <!-- id:quoted --> <!-- id:quoted-idquoted -->')],
    })
    const { cleaned, changed } = cleanHeadingIdResidue(tree)
    expect(changed).toBe(true)
    const bq = (cleaned as { content: Node[] }).content[0]
    const h = bq?.content?.[0]
    expect(headingText(h)).toBe('Quoted')
    expect(h?.attrs?.id).toBe('quoted')
  })

  it('never throws on malformed input', () => {
    expect(cleanHeadingIdResidue(null).changed).toBe(false)
    expect(cleanHeadingIdResidue(undefined).changed).toBe(false)
    expect(cleanHeadingIdResidue('str').changed).toBe(false)
    expect(cleanHeadingIdResidue([1, 2]).changed).toBe(false)
    expect(cleanHeadingIdResidue({}).changed).toBe(false)
    expect(cleanHeadingIdResidue({ type: 'doc' }).changed).toBe(false)
  })
})

describe('canonical projection — consumes the FIXED serializer', () => {
  it('serializeMarkdown(cleaned) emits exactly ONE id comment for a healed heading', () => {
    const { cleaned } = cleanHeadingIdResidue(doc(pollutedHeading(1, POLLUTED_TEXT)))
    const md = serializeMarkdown(cleaned)
    expect(md).toBe(CANONICAL_MD)
    expect((md.match(/<!--\s*id:/g) ?? []).length).toBe(1)
  })

  it('the canonical projection is a fixpoint of the v0.2.9 pipeline (serialize∘parse stable)', () => {
    const { cleaned } = cleanHeadingIdResidue(doc(pollutedHeading(1, POLLUTED_TEXT)))
    const md = serializeMarkdown(cleaned)
    expect(serializeMarkdown(markdownToJson(md))).toBe(md)
  })

  it('CROSS-CHECK PIN: the surgical strip agrees with parse.ts on the same polluted text', () => {
    // parse.ts owns the md-level strip (HEADING_ID_GLOBAL_RE). The repair module
    // mirrors that pattern for PM-JSON text nodes. This test pins the two together:
    // cleaning the JSON heading must yield the same text + id that parsing the
    // equivalent polluted MARKDOWN heading yields. If the patterns drift, this fails.
    const viaJson = cleanHeadingIdResidue(doc(pollutedHeading(1, POLLUTED_TEXT)))
    const jsonHeading = firstHeading(viaJson.cleaned)
    const viaParse = firstHeading(markdownToJson(`# ${POLLUTED_TEXT}\n`))
    expect(headingText(jsonHeading)).toBe(headingText(viaParse))
    expect(jsonHeading?.attrs?.id).toBe(viaParse?.attrs?.id)
  })

  it('multi-heading docs heal independently, no cross-pollution', () => {
    const tree = doc(
      pollutedHeading(1, 'Intro <!-- id:intro --> <!-- id:intro-idintro -->'),
      pollutedHeading(2, 'Details <!-- id:details --> <!-- id:details-iddetails -->'),
    )
    const { cleaned } = cleanHeadingIdResidue(tree)
    const md = serializeMarkdown(cleaned)
    expect(md).toBe('# Intro <!-- id:intro -->\n\n## Details <!-- id:details -->\n')
  })

  it('a doc with footnotes keeps its GFM footnote serialization intact after healing', () => {
    const tree = doc(
      pollutedHeading(1, 'Notes <!-- id:notes --> <!-- id:notes-idnotes -->'),
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Claim' },
          { type: 'footnoteRef', attrs: { number: 1 } },
        ],
      },
      {
        type: 'footnotes',
        content: [
          {
            type: 'footnoteItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Source.' }] }],
          },
        ],
      },
    )
    const { cleaned } = cleanHeadingIdResidue(tree)
    const md = serializeMarkdown(cleaned)
    // The footnote ref + definition serialize exactly as serialize.ts always does —
    // the repair never routed them through the (lossy for footnotes) parse path.
    expect(md).toContain('Claim[^1]')
    expect(md).toContain('[^1]: Source.')
    expect(md).toContain('# Notes <!-- id:notes -->')
  })
})
