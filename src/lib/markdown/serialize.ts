// B0 baseline: one-way ProseMirror-JSON → canonical markdown (for disk-mirror +
// full-text search).
//
// F3 — LOSSLESS CANONICAL FORM: Parchment's custom blocks that standard
// markdown cannot represent are serialized as fenced `parchment:<kind>` code
// blocks carrying their attrs (and, for tables, full content) as single-line
// JSON. parse.ts reconstructs the exact node from those fences, so the
// following now round-trip:
//   - pageBreak    → ```parchment:pagebreak  (empty body)
//   - sectionBreak → ```parchment:section    (attrs: headerText, footerText,
//                                              pageNumberFormat, pageNumberPosition)
//   - toc          → ```parchment:toc        (attrs: showPageNumbers)
//   - table        → ```parchment:table      (full {type:'table',content:[…]}
//                                              JSON; preserves cell `formula`,
//                                              colspan/rowspan/colwidth)
// Standard markdown (headings, paragraphs, lists, marks, blockquote, code
// fences, links, hr, hard breaks) is emitted as plain markdown. Footnotes use
// GFM `[^N]` / `[^N]:` definitions and round-trip via that GFM form, not a
// parchment fence.
//
// RESERVED NAMESPACE: the `parchment:` code-fence language prefix is a reserved
// reconstruction sentinel (see parse.ts). A custom block emits `parchment:<kind>`
// here and parse.ts reconstructs the exact node. A user-authored ordinary code
// block whose language *also* begins with `parchment:` would collide with this
// sentinel on the next parse (e.g. `parchment:pagebreak` reconstructs to a
// pageBreak and DROPS the code body). This is a deliberate, documented edge —
// users must not author a `parchment:`-prefixed code-block language.
//
// CONSTRAINT: this module runs in the Next.js *server* runtime — it must NOT
// import the editor extension graph, @tiptap/html, or any DOM. The parchment
// fences are produced with plain JSON.stringify, no editor deps.

type Mark = { type: string; attrs?: Record<string, unknown> }
type PMNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: Mark[]
}

const MARK_ORDER: Record<string, number> = { code: 0, italic: 1, bold: 2, strike: 3, link: 4 }

function escapeText(t: string): string {
  return t.replace(/[\\`*_~[\]]/g, '\\$&')
}

/**
 * F6 WIKI-LABEL INVARIANT: a `[[Label]]` round-trips losslessly ONLY when the
 * label contains no `[` or `]`. The delimiters are themselves brackets, and the
 * parse-side recognizer (parse.ts WIKI_LINK_RE = /\[\[([^[\]]+)\]\]/g) matches a
 * label that cannot contain `[` or `]` — escaping does not help because `marked`
 * splits `\[`/`\]` into separate tokens before the wiki-link regex ever runs.
 *
 * We therefore enforce the invariant at every boundary that produces a label:
 *   - insert (wiki-link.ts insertWikiLink) — strips brackets from the doc title
 *     used as the autocomplete label, so a doc titled e.g. `Notes [draft]`
 *     yields a clean, round-trippable wikiLink.
 *   - serialize (here) — strips defensively so any pre-existing/hand-built node
 *     still emits canonical, parse-stable markdown rather than degrading to text.
 *
 * Stripping (not escaping) keeps the displayed label readable and guarantees the
 * `[[…]]` survives the serialize → disk-mirror → parse cycle (and thus stays in
 * doc_links on reverse-sync). An all-bracket / empty label collapses to '' and
 * is emitted as `[[]]`, which the parser declines to match — correct, since an
 * empty label cannot identify a target.
 */
function sanitizeWikiLabel(label: unknown): string {
  return String(label ?? '').replace(/[[\]]/g, '')
}

function wrapMark(text: string, mark: Mark): string {
  switch (mark.type) {
    case 'code':
      return `\`${text}\``
    case 'italic':
      return `*${text}*`
    case 'bold':
      return `**${text}**`
    case 'strike':
      return `~~${text}~~`
    case 'link':
      return `[${text}](${String(mark.attrs?.href ?? '')})`
    default:
      return text
  }
}

function serializeText(node: PMNode): string {
  const marks = node.marks ?? []
  const hasCode = marks.some((m) => m.type === 'code')
  let out = hasCode ? (node.text ?? '') : escapeText(node.text ?? '')
  const ordered = [...marks].sort((a, b) => (MARK_ORDER[a.type] ?? 99) - (MARK_ORDER[b.type] ?? 99))
  for (const mark of ordered) out = wrapMark(out, mark)
  return out
}

function serializeInline(content: PMNode[] | undefined): string {
  if (!content) return ''
  return content
    .map((n) => {
      if (n.type === 'text') return serializeText(n)
      if (n.type === 'hardBreak') return '\n'
      // B8: footnote reference → [^N] in GFM style
      if (n.type === 'footnoteRef') return `[^${String(n.attrs?.number ?? 1)}]`
      // F6: wiki link → [[Label]] (only the label is emitted; the targetId is
      // NOT stored in markdown — it is resolved on parse by title lookup, which
      // is a documented GAP in parse.ts since markdownToJson stays sync).
      if (n.type === 'wikiLink') return `[[${sanitizeWikiLabel(n.attrs?.label)}]]`
      // G4: inline math → $latex$ (single dollars). Empty latex emits `$$`,
      // which parse.ts (conservative) will NOT match back as math — a documented
      // edge for a math node the user never filled in.
      if (n.type === 'mathInline') return `$${String(n.attrs?.latex ?? '')}$`
      // G4: equation reference → plain `(N)` text. This is intentionally lossy:
      // on parse `(N)` is ordinary text, NOT reconstructed as an equationRef
      // node. The rendered number is preserved in the markdown for human reading;
      // the live ref binding is an editor-only concern (documented v0.1 choice).
      if (n.type === 'equationRef') return `(${String(n.attrs?.targetIndex ?? 1)})`
      // G7b: citation inline → Pandoc-style [@citeKey] or [@citeKey, p. X].
      // Lossless round-trip: parse.ts reconstructs the citation node from this
      // syntax via CITE_RE. The page locator is preserved in the brackets.
      if (n.type === 'citation') {
        const key = String(n.attrs?.citeKey ?? '')
        const page = String(n.attrs?.page ?? '')
        if (!key) return ''
        return page ? `[@${key}, p. ${page}]` : `[@${key}]`
      }
      // G8b: cross-reference inline → `[#targetId]` (full format, default) or
      // `[#targetId|number]` (number-only format). Lossless round-trip: parse.ts
      // reconstructs the crossRef node from this syntax via CROSSREF_RE.
      if (n.type === 'crossRef') {
        const targetId = String(n.attrs?.targetId ?? '')
        if (!targetId) return ''
        const format = n.attrs?.format === 'number' ? 'number' : 'full'
        return format === 'number' ? `[#${targetId}|number]` : `[#${targetId}]`
      }
      // G8a: image — plain ![alt](src) (no caption/refId metadata to preserve).
      // Images WITH caption or refId are serialized as blocks (serializeBlock).
      if (n.type === 'image') {
        const alt = String(n.attrs?.alt ?? '')
        const src = String(n.attrs?.src ?? '')
        return `![${alt}](${src})`
      }
      return serializeInline(n.content)
    })
    .join('')
}

function rawText(content: PMNode[] | undefined): string {
  if (!content) return ''
  return content.map((n) => (n.type === 'text' ? (n.text ?? '') : rawText(n.content))).join('')
}

function prefixLines(block: string, prefix: string): string {
  return block
    .split('\n')
    .map((line) => prefix + line)
    .join('\n')
}

function serializeListItem(item: PMNode, marker: string): string {
  const inner = serializeBlocks(item.content)
  const indent = ' '.repeat(marker.length)
  return inner
    .split('\n')
    .map((line, i) => (i === 0 ? marker + line : indent + line))
    .join('\n')
}

function serializeBlock(node: PMNode): string {
  switch (node.type) {
    case 'heading': {
      // G8a: preserve the `id` attr assigned by HeadingId so heading cross-ref
      // targets survive a disk-mirror cycle. If the id is present and non-empty,
      // append it as an HTML attribute comment `<!-- id:slug -->` on the same
      // line. parse.ts picks this up and restores `attrs.id`. Without this, after
      // a serialize → parse cycle all heading `id` attrs are '' and
      // collectCrossRefTargets skips every heading (requires non-empty attrs.id).
      const headingMd = `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${serializeInline(node.content)}`
      const id = typeof node.attrs?.id === 'string' && node.attrs.id ? node.attrs.id : ''
      return id ? `${headingMd} <!-- id:${id} -->` : headingMd
    }
    case 'paragraph':
      return serializeInline(node.content)
    case 'blockquote':
      return prefixLines(serializeBlocks(node.content), '> ')
    case 'codeBlock':
      return `\`\`\`${String(node.attrs?.language ?? '')}\n${rawText(node.content)}\n\`\`\``
    case 'horizontalRule':
      return '---'
    // G4: display equation → a `$$` fenced block on its own lines. The latex is
    // emitted verbatim between the fences so parse.ts (DISPLAY_MATH_RE) can
    // reconstruct it. Emitted even when latex is empty (`$$\n\n$$`), though an
    // empty display block won't round-trip back to a node (documented edge).
    case 'mathBlock':
      // G8a: a mathBlock WITH a refId round-trips via parchment:equation fence
      // so the stable refId survives the markdown cycle. Without a refId it uses
      // the portable $$…$$ syntax (same as G4, remains parse-round-trippable).
      if (node.attrs?.refId && String(node.attrs.refId).length > 0) {
        return parchmentFence(
          'equation',
          JSON.stringify({
            latex: String(node.attrs.latex ?? ''),
            refId: String(node.attrs.refId),
          }),
        )
      }
      return `$$\n${String(node.attrs?.latex ?? '')}\n$$`
    // G8a: image as a block — losslessly encode src/alt/caption/refId and all
    // layout attrs (position, width, height, lockAspect) via parchment:figure.
    // parse.ts reconstructs the exact image node from this fence.
    // ENCODING CHOICE: parchment:figure fence (same pattern as table/drawing)
    // rather than "![alt](src)" + sentinel comment, because a figure has 7
    // attrs that standard markdown cannot represent, and a fence is the proven
    // lossless channel already used by every other custom block.
    case 'image':
      return parchmentFence(
        'figure',
        JSON.stringify({
          src: String(node.attrs?.src ?? ''),
          alt: String(node.attrs?.alt ?? ''),
          caption: String(node.attrs?.caption ?? ''),
          refId: String(node.attrs?.refId ?? ''),
          position: String(node.attrs?.position ?? 'inline'),
          width: node.attrs?.width ?? null,
          height: node.attrs?.height ?? null,
          lockAspect: node.attrs?.lockAspect ?? true,
        }),
      )
    case 'bulletList':
      return (node.content ?? []).map((li) => serializeListItem(li, '- ')).join('\n')
    case 'orderedList':
      return (node.content ?? []).map((li, i) => serializeListItem(li, `${i + 1}. `)).join('\n')
    // B8: footnotes block — emit GFM-style definitions [^N]: text
    case 'footnotes':
      return serializeFootnotesBlock(node)
    // F3: custom blocks → fenced parchment:<kind> with single-line JSON body.
    case 'pageBreak':
      return parchmentFence('pagebreak', '')
    case 'sectionBreak':
      return parchmentFence('section', JSON.stringify(sectionAttrs(node.attrs)))
    case 'toc':
      return parchmentFence('toc', JSON.stringify(tocAttrs(node.attrs)))
    case 'table':
      // G8a: table caption + refId are stored in node.attrs and round-trip
      // through the parchment:table fence (attrs key carries them intact).
      return parchmentFence(
        'table',
        JSON.stringify({
          type: 'table',
          ...(node.attrs ? { attrs: node.attrs } : {}),
          content: node.content ?? [],
        }),
      )
    // G5: drawing — emit the full node JSON (scene + svg) so parse.ts can
    // reconstruct it losslessly. NO excalidraw import — scene + svg are plain
    // JSON/string values already stored in the node attrs.
    case 'drawing':
      return parchmentFence(
        'drawing',
        JSON.stringify({
          type: 'drawing',
          attrs: { scene: node.attrs?.scene ?? null, svg: node.attrs?.svg ?? '' },
        }),
      )
    // G6a: mermaid — emit as a standard ```mermaid code fence (NOT a
    // parchment: fence) so it is portable and disk-mirror friendly. No mermaid
    // import — source is a plain string stored in the node attr.
    case 'mermaid': {
      const src = typeof node.attrs?.source === 'string' ? node.attrs.source : ''
      return `\`\`\`\`mermaid\n${src}\n\`\`\`\``
    }
    // G6b: plantuml — emit as a standard ```plantuml code fence (NOT a
    // parchment: fence) so it is portable and disk-mirror friendly. No
    // plantuml import — source is a plain string stored in the node attr.
    case 'plantuml': {
      const src = typeof node.attrs?.source === 'string' ? node.attrs.source : ''
      return `\`\`\`\`plantuml\n${src}\n\`\`\`\``
    }
    // G6c: drawio — emit the full node JSON (xml + svg) as a parchment:drawio
    // fence so parse.ts can reconstruct it losslessly. NO drawio import — xml
    // and svg are plain strings already stored in the node attrs.
    case 'drawio':
      return parchmentFence(
        'drawio',
        JSON.stringify({
          type: 'drawio',
          attrs: {
            xml: typeof node.attrs?.xml === 'string' ? node.attrs.xml : '',
            svg: typeof node.attrs?.svg === 'string' ? node.attrs.svg : '',
          },
        }),
      )
    // G7b: bibliography — emit as a parchment:bibliography fence with the full
    // {refs, style} JSON so parse.ts can reconstruct it losslessly. NO editor
    // import — refs is a plain array already stored in the node attrs.
    case 'bibliography':
      return parchmentFence(
        'bibliography',
        JSON.stringify({
          refs: Array.isArray(node.attrs?.refs) ? node.attrs.refs : [],
          style: typeof node.attrs?.style === 'string' ? node.attrs.style : 'apa',
        }),
      )
    // G16: speakerNote — lossless round-trip as parchment:speakernote fence
    // carrying the inline content array as JSON (like table/drawing/bibliography
    // do for their complex content). Storing serializeInline() text was lossy
    // because parse.ts reconstructed a plain text node containing the raw
    // markdown string — losing all mark information (bold, italic, links, etc.)
    // after one serialize→parse cycle. Storing the content array is fully lossless.
    case 'speakerNote':
      return parchmentFence(
        'speakernote',
        JSON.stringify({ content: Array.isArray(node.content) ? node.content : [] }),
      )
    default:
      return serializeInline(node.content)
  }
}

/**
 * Serialize the footnotes block node into a sequence of GFM footnote
 * definitions: `[^N]: <item text>`.
 * Items are emitted in document order; each item's number is derived from
 * its `data-fn-id` matched against the order of refs in the doc — but since
 * serialize.ts receives a plain JSON tree without the editor's numbering
 * plugin running, we simply emit items in the order they appear in the block
 * and use 1-based sequential numbers.
 */
function serializeFootnotesBlock(node: PMNode): string {
  const items = node.content ?? []
  return items
    .map((item, i) => {
      const text = serializeBlocks(item.content)
      const firstLine = text.split('\n')[0] ?? ''
      const rest = text.split('\n').slice(1).join('\n')
      const body = rest ? `${firstLine}\n${prefixLines(rest, '    ')}` : firstLine
      return `[^${i + 1}]: ${body}`
    })
    .join('\n')
}

/**
 * F3: wrap a custom block as a fenced `parchment:<kind>` code block. The body
 * (when present) is a single line of JSON so the closing fence is never broken
 * by an embedded newline.
 */
function parchmentFence(kind: string, body: string): string {
  const inner = body.length ? `\n${body}` : ''
  return `\`\`\`parchment:${kind}${inner}\n\`\`\``
}

/**
 * F3: project a sectionBreak node's attrs onto the canonical key order so the
 * serialized fence is deterministic regardless of object insertion order. The
 * four attrs mirror SectionBreakExtension.addAttributes().
 */
function sectionAttrs(attrs: Record<string, unknown> | undefined): Record<string, unknown> {
  const a = attrs ?? {}
  return {
    headerText: a.headerText ?? '',
    footerText: a.footerText ?? '',
    pageNumberFormat: a.pageNumberFormat ?? '1',
    pageNumberPosition: a.pageNumberPosition ?? 'center',
  }
}

/**
 * F3: project a toc node's attrs onto its schema default so `{type:'toc'}` and
 * `{type:'toc',attrs:{showPageNumbers:false}}` serialize identically. Mirrors
 * sectionAttrs() and TocExtension.addAttributes() (showPageNumbers default false).
 */
function tocAttrs(attrs: Record<string, unknown> | undefined): Record<string, unknown> {
  const a = attrs ?? {}
  return {
    showPageNumbers: typeof a.showPageNumbers === 'boolean' ? a.showPageNumbers : false,
  }
}

function serializeBlocks(content: PMNode[] | undefined): string {
  if (!content) return ''
  return content.map(serializeBlock).join('\n\n')
}

export function serializeMarkdown(doc: unknown): string {
  const body = serializeBlocks((doc as PMNode).content)
  return body.length ? `${body}\n` : ''
}
