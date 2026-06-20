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
      if (n.type === 'wikiLink') return `[[${String(n.attrs?.label ?? '')}]]`
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
    case 'heading':
      return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${serializeInline(node.content)}`
    case 'paragraph':
      return serializeInline(node.content)
    case 'blockquote':
      return prefixLines(serializeBlocks(node.content), '> ')
    case 'codeBlock':
      return `\`\`\`${String(node.attrs?.language ?? '')}\n${rawText(node.content)}\n\`\`\``
    case 'horizontalRule':
      return '---'
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
      return parchmentFence(
        'table',
        JSON.stringify({
          type: 'table',
          ...(node.attrs ? { attrs: node.attrs } : {}),
          content: node.content ?? [],
        }),
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
