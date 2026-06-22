// F2: reverse of serialize.ts — markdown → ProseMirror JSON (server-side).
//
// IMPORTANT: this runs in the Next.js *server* runtime (the disk reverse-sync
// watcher). The Tiptap/ProseMirror editor extension graph and @tiptap/html do
// NOT load in that turbopack server bundle (they throw "Class extends undefined"
// at module evaluation). So we DO NOT use generateJSON here — we hand-roll a
// `marked` token walk into ProseMirror JSON, with zero editor-graph / DOM deps.
//
// FIDELITY BOUNDARY: standard markdown (headings, paragraphs, lists,
// bold/italic/strike/code, blockquote, code fences, links, hr, hard breaks)
// round-trips. F3 adds LOSSLESS round-trip of Parchment's custom blocks: they
// are emitted by serialize.ts as fenced `parchment:<kind>` code blocks and
// reconstructed here into the exact PM node:
//   - parchment:pagebreak → { type: 'pageBreak' }
//   - parchment:section   → { type: 'sectionBreak', attrs:{headerText,
//                             footerText, pageNumberFormat, pageNumberPosition} }
//   - parchment:toc       → { type: 'toc', attrs:{showPageNumbers} }
//   - parchment:table     → the full { type:'table', content:[…] } node
//                           (cell `formula`, colspan/rowspan/colwidth preserved)
// A malformed/un-parseable parchment fence degrades to a plain codeBlock and
// NEVER throws.
//
// KNOWN GAP — footnoteRef: serialize.ts emits footnoteRef inline nodes as
// `[^N]` (GFM syntax). parse.ts does NOT load a GFM footnote extension into
// marked, so `[^1]` is lexed as plain text and reconstructed as a text node,
// not a footnoteRef node. footnoteRef does NOT round-trip through markdown.
//
// RESERVED NAMESPACE — the `parchment:` code-fence language prefix is a
// deliberate reconstruction sentinel (matched by /^parchment:(\S+)/ in the
// `code` token handler). Users MUST NOT author an ordinary code block whose
// language starts with `parchment:`; such a fence is interpreted as a custom
// block, not preserved as code. Note in particular that `parchment:pagebreak`
// is reconstructed to `{type:'pageBreak'}` UNCONDITIONALLY and its body is
// discarded — a known, lossy edge for this reserved prefix. An unrecognized
// kind or a malformed body falls through to a plain codeBlock (never throws).

import { marked } from 'marked'
import { parseCslEntries } from '@/lib/citations/types'

type PMNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}
type Mark = { type: string; attrs?: Record<string, unknown> }
// marked tokens are loosely typed; we read fields defensively.
type Tok = {
  type?: string
  text?: string
  raw?: string
  depth?: number
  lang?: string
  ordered?: boolean
  href?: string
  tokens?: Tok[]
  items?: Tok[]
}

/** A text node, or null when the string is empty (PM forbids empty text nodes). */
function textNode(s: string, marks: Mark[]): PMNode | null {
  if (s.length === 0) return null
  return { type: 'text', text: s, ...(marks.length ? { marks } : {}) }
}

// F6: `[[Label]]` wiki-link recognition. A non-greedy capture of any chars
// except `[` and `]` between double brackets so `[[A]] x [[B]]` yields two
// distinct links and a stray `]]` cannot over-match.
const WIKI_LINK_RE = /\[\[([^[\]]+)\]\]/g

/**
 * G4: CONSERVATIVE inline-math recognition. A `$…$` pair becomes a `mathInline`
 * node ONLY when it is unambiguously math and not currency. The rules (modeled
 * on pandoc's tex_math_dollars):
 *   - the content between the dollars is non-empty and contains no `$`;
 *   - the char right after the opening `$` is NOT whitespace;
 *   - the char right before the closing `$` is NOT whitespace;
 *   - the char right after the closing `$` is NOT a digit (so `$5.00 and $3.00`
 *     stays text — the only closing candidate is followed by a digit);
 *   - the char right before the opening `$` is NOT a digit (so `100$x$` — a
 *     price-like prefix — does not start math).
 * A lone `$` (e.g. a single `$5.00` price) has no closing partner and never
 * matches. The capture group disallows `$` inside so `$a$ b $c$` yields two
 * separate inline-math nodes, not one spanning the middle.
 */
const INLINE_MATH_RE = /(?<![\d$])\$([^$\s][^$]*?[^$\s]|[^$\s])\$(?![\d$])/g

/**
 * G7b: CONSERVATIVE inline citation recognition.
 * Matches `[@citeKey]` and `[@citeKey, p. X]` patterns only.
 * Pattern: \[@([\w:.-]+)(?:,\s*([^\]]+))?\]
 *   - citeKey: word chars, colon, period, hyphen (e.g. "10.1000/xyz" or "smith2020")
 *   - locator: optional ", ..." captured as-is (page field)
 * A stray `[@` followed by anything not matching stays plain text (conservative).
 * NEVER throws. Documents the locator round-trip: page stored as-is in the
 * citation node's `page` attr and serialized back as `p. X` if originally
 * from `p. X`, otherwise verbatim.
 */
const CITE_RE = /\[@([\w:./-]+)(?:,\s*([^\]]+))?\]/g

function splitCitations(s: string, marks: Mark[]): PMNode[] {
  if (!s.includes('[@')) return splitWikiLinks(s, marks)
  const out: PMNode[] = []
  let last = 0
  CITE_RE.lastIndex = 0
  let m: RegExpExecArray | null = CITE_RE.exec(s)
  while (m !== null) {
    if (m.index > last) out.push(...splitWikiLinks(s.slice(last, m.index), marks))
    const key = m[1] ?? ''
    const locator = m[2] ?? ''
    // Strip a leading "p. " prefix from the locator for the page field.
    const page = locator.replace(/^p\.\s*/, '').trim()
    if (key) {
      out.push({
        type: 'citation',
        attrs: { citeKey: key, page },
      })
    }
    last = m.index + m[0].length
    m = CITE_RE.exec(s)
  }
  if (last < s.length) out.push(...splitWikiLinks(s.slice(last), marks))
  return out
}

/**
 * F6: split a literal text run into a mix of plain text nodes and wikiLink atom
 * nodes wherever `[[Label]]` appears. Marks carry onto the surrounding text but
 * NOT onto the wikiLink atom (its content is fixed). The targetId is left ''
 * (unresolved) — markdownToJson is sync and must not hit @/db, so hand-typed
 * `[[Label]]` from external markdown resolves its id only when the doc is
 * reopened/relinked in the editor. This is the documented GAP.
 */
function splitWikiLinks(s: string, marks: Mark[]): PMNode[] {
  if (!s.includes('[[')) {
    const n = textNode(s, marks)
    return n ? [n] : []
  }
  const out: PMNode[] = []
  let last = 0
  WIKI_LINK_RE.lastIndex = 0
  let m: RegExpExecArray | null = WIKI_LINK_RE.exec(s)
  while (m !== null) {
    if (m.index > last) {
      const before = textNode(s.slice(last, m.index), marks)
      if (before) out.push(before)
    }
    out.push({ type: 'wikiLink', attrs: { targetId: '', label: m[1] ?? '' } })
    last = m.index + m[0].length
    m = WIKI_LINK_RE.exec(s)
  }
  if (last < s.length) {
    const tail = textNode(s.slice(last), marks)
    if (tail) out.push(tail)
  }
  return out
}

/**
 * G4: split a literal text run into text + `mathInline` atom nodes wherever a
 * conservative `$…$` pair appears (see INLINE_MATH_RE). The surrounding text is
 * further split for wiki-links and citations. Marks carry onto text but NOT
 * onto the math atom (its content is the LaTeX attr, not styled text). NEVER
 * throws — on no match it degrades to plain wiki-split text.
 */
function splitInlineMath(s: string, marks: Mark[]): PMNode[] {
  if (!s.includes('$')) return splitCitations(s, marks)
  const out: PMNode[] = []
  let last = 0
  INLINE_MATH_RE.lastIndex = 0
  let m: RegExpExecArray | null = INLINE_MATH_RE.exec(s)
  while (m !== null) {
    if (m.index > last) out.push(...splitCitations(s.slice(last, m.index), marks))
    out.push({ type: 'mathInline', attrs: { latex: m[1] ?? '' } })
    last = m.index + m[0].length
    m = INLINE_MATH_RE.exec(s)
  }
  if (last < s.length) out.push(...splitCitations(s.slice(last), marks))
  return out
}

/** Walk inline tokens → text nodes (+ hardBreak), accumulating marks. */
function inline(tokens: Tok[] | undefined, marks: Mark[]): PMNode[] {
  const out: PMNode[] = []
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'strong':
        out.push(...inline(t.tokens, [...marks, { type: 'bold' }]))
        break
      case 'em':
        out.push(...inline(t.tokens, [...marks, { type: 'italic' }]))
        break
      case 'del':
        out.push(...inline(t.tokens, [...marks, { type: 'strike' }]))
        break
      case 'codespan': {
        const n = textNode(t.text ?? '', [...marks, { type: 'code' }])
        if (n) out.push(n)
        break
      }
      case 'link':
        out.push(...inline(t.tokens, [...marks, { type: 'link', attrs: { href: t.href ?? '' } }]))
        break
      case 'br':
        out.push({ type: 'hardBreak' })
        break
      default: {
        // text / escape / html / anything else: emit its nested inline tokens if
        // present, else its literal text — splitting out any `[[Label]]` wiki
        // links (F6) from the literal run.
        if (t.tokens && t.tokens.length > 0) {
          out.push(...inline(t.tokens, marks))
        } else {
          // G4: split inline math first (then wiki-links inside the text parts).
          out.push(...splitInlineMath(t.text ?? '', marks))
        }
      }
    }
  }
  return out
}

function paragraph(tokens: Tok[] | undefined): PMNode {
  const content = inline(tokens, [])
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

/**
 * G4: a display-math block is serialized as `$$` on its own line, the LaTeX, and
 * a closing `$$` on its own line. `marked` lexes that as a paragraph whose raw
 * text is exactly that shape. This recognizer matches `$$ … $$` (the inner LaTeX
 * may span multiple lines) and returns a `mathBlock` node, or null if the raw
 * text is not a standalone display-math block. Conservative: requires the `$$`
 * to open and close the whole block (anchored) so an inline `$$x$$` mid-sentence
 * is left to the inline path / plain text. Empty inner LaTeX returns null so an
 * empty `$$\n\n$$` degrades to text rather than an empty equation node.
 */
const DISPLAY_MATH_RE = /^\$\$\s*\n?([\s\S]*?)\n?\s*\$\$$/
function displayMathBlock(raw: string): PMNode | null {
  const m = DISPLAY_MATH_RE.exec(raw.trim())
  if (!m) return null
  const latex = (m[1] ?? '').trim()
  if (latex.length === 0) return null
  return { type: 'mathBlock', attrs: { latex } }
}

/**
 * F3: parse a `parchment:<kind>` fence body into the exact custom PM node.
 * Returns `null` to signal "not a valid parchment fence" so the caller degrades
 * to a plain codeBlock. NEVER throws — JSON parse failures return null.
 */
function reconstructParchment(kind: string, body: string): PMNode | null {
  // pagebreak carries no body — it round-trips structurally.
  if (kind === 'pagebreak') return { type: 'pageBreak' }

  let payload: unknown
  try {
    payload = body.trim().length ? JSON.parse(body) : {}
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null
  const data = payload as Record<string, unknown>

  switch (kind) {
    case 'section':
      return {
        type: 'sectionBreak',
        attrs: {
          headerText: typeof data.headerText === 'string' ? data.headerText : '',
          footerText: typeof data.footerText === 'string' ? data.footerText : '',
          pageNumberFormat: typeof data.pageNumberFormat === 'string' ? data.pageNumberFormat : '1',
          pageNumberPosition:
            typeof data.pageNumberPosition === 'string' ? data.pageNumberPosition : 'center',
        },
      }
    case 'toc':
      // Mirror the sectionBreak treatment: project the known attr onto its
      // schema default (toc.ts: showPageNumbers defaults to false) so an
      // attr-less or partial body reconstructs to the exact editor node rather
      // than trusting the raw JSON verbatim.
      return {
        type: 'toc',
        attrs: {
          showPageNumbers: typeof data.showPageNumbers === 'boolean' ? data.showPageNumbers : false,
        },
      }
    case 'table': {
      // The body is the full table node JSON; validate its shape before trusting
      // it (so a stray `parchment:table` fence cannot inject a non-table node).
      if (data.type !== 'table' || !Array.isArray(data.content)) return null
      return {
        type: 'table',
        ...(data.attrs && typeof data.attrs === 'object'
          ? { attrs: data.attrs as Record<string, unknown> }
          : {}),
        content: data.content as PMNode[],
      }
    }
    case 'drawing': {
      // The body is { type:'drawing', attrs:{ scene, svg } }. Validate type
      // guard before trusting (mirrors the table guard above). NO excalidraw.
      if (data.type !== 'drawing') return null
      const attrsRaw = data.attrs
      if (typeof attrsRaw !== 'object' || attrsRaw === null) return null
      const attrs = attrsRaw as Record<string, unknown>
      return {
        type: 'drawing',
        attrs: {
          scene: attrs.scene ?? null,
          svg: typeof attrs.svg === 'string' ? attrs.svg : '',
        },
      }
    }
    case 'drawio': {
      // The body is { type:'drawio', attrs:{ xml, svg } }. Validate type guard
      // before trusting (mirrors the drawing guard above). NO drawio import.
      if (data.type !== 'drawio') return null
      const attrsRaw = data.attrs
      if (typeof attrsRaw !== 'object' || attrsRaw === null) return null
      const attrs = attrsRaw as Record<string, unknown>
      return {
        type: 'drawio',
        attrs: {
          xml: typeof attrs.xml === 'string' ? attrs.xml : '',
          svg: typeof attrs.svg === 'string' ? attrs.svg : '',
        },
      }
    }
    case 'bibliography': {
      // The body is { refs: CslEntry[], style: CiteStyle }.
      // parseCslEntries validates/normalizes; style is coerced to a known value.
      const refsRaw = data.refs
      const refs = parseCslEntries(Array.isArray(refsRaw) ? refsRaw : [])
      const style = data.style
      const safeStyle = style === 'apa' || style === 'mla' || style === 'chicago' ? style : 'apa'
      return {
        type: 'bibliography',
        attrs: { refs, style: safeStyle },
      }
    }
    case 'figure': {
      // G8a: lossless figure (image with caption + refId) round-trip.
      // The body is { src, alt, caption, refId, position, width, height, lockAspect }.
      const src = typeof data.src === 'string' ? data.src : ''
      if (!src) return null
      return {
        type: 'image',
        attrs: {
          src,
          alt: typeof data.alt === 'string' ? data.alt : '',
          caption: typeof data.caption === 'string' ? data.caption : '',
          refId: typeof data.refId === 'string' ? data.refId : '',
          position: typeof data.position === 'string' ? data.position : 'inline',
          width: typeof data.width === 'number' ? data.width : null,
          height: typeof data.height === 'number' ? data.height : null,
          lockAspect: typeof data.lockAspect === 'boolean' ? data.lockAspect : true,
        },
      }
    }
    case 'equation': {
      // G8a: lossless mathBlock + refId round-trip.
      // The body is { latex, refId }.
      const latex = typeof data.latex === 'string' ? data.latex : ''
      if (!latex) return null
      return {
        type: 'mathBlock',
        attrs: {
          latex,
          refId: typeof data.refId === 'string' ? data.refId : '',
        },
      }
    }
    default:
      return null
  }
}

/** Walk block tokens → block PM nodes. */
function blocks(tokens: Tok[] | undefined): PMNode[] {
  const out: PMNode[] = []
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'heading':
        out.push({
          type: 'heading',
          attrs: { level: Math.min(Math.max(t.depth ?? 1, 1), 6) },
          ...(inline(t.tokens, []).length ? { content: inline(t.tokens, []) } : {}),
        })
        break
      case 'paragraph': {
        // G4: a standalone `$$ … $$` paragraph is a display equation block.
        const mathBlock = displayMathBlock(t.raw ?? t.text ?? '')
        if (mathBlock) {
          out.push(mathBlock)
          break
        }
        out.push(paragraph(t.tokens))
        break
      }
      case 'code': {
        const code = t.text ?? ''
        const lang = t.lang ?? ''
        // G6a: a `mermaid` fence reconstructs a mermaid node (wins over shiki
        // code-block path). Standard language fence, NOT a parchment: fence.
        // NO mermaid import — source is stored as a plain string. Never throws.
        if (lang === 'mermaid') {
          out.push({ type: 'mermaid', attrs: { source: code } })
          break
        }
        // G6b: a `plantuml` fence reconstructs a plantuml node. Standard
        // language fence, NOT a parchment: fence. NO plantuml import — source
        // is stored as a plain string. Never throws.
        if (lang === 'plantuml') {
          out.push({ type: 'plantuml', attrs: { source: code } })
          break
        }
        // F3: a `parchment:<kind>` fence reconstructs a custom PM node. On any
        // failure we fall through to the plain codeBlock below (never throw).
        const fenceMatch = /^parchment:(\S+)/.exec(lang)
        if (fenceMatch) {
          const node = reconstructParchment(fenceMatch[1] ?? '', code)
          if (node) {
            out.push(node)
            break
          }
        }
        out.push({
          type: 'codeBlock',
          attrs: { language: lang.length ? lang : null },
          ...(code.length ? { content: [{ type: 'text', text: code }] } : {}),
        })
        break
      }
      case 'blockquote': {
        const inner = blocks(t.tokens)
        out.push({ type: 'blockquote', content: inner.length ? inner : [{ type: 'paragraph' }] })
        break
      }
      case 'list': {
        const items = (t.items ?? []).map((item): PMNode => {
          const itemBlocks = blocks(item.tokens)
          return {
            type: 'listItem',
            content: itemBlocks.length ? itemBlocks : [{ type: 'paragraph' }],
          }
        })
        out.push({
          type: t.ordered ? 'orderedList' : 'bulletList',
          content: items.length ? items : [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
        })
        break
      }
      case 'hr':
        out.push({ type: 'horizontalRule' })
        break
      case 'space':
        break
      case 'text':
        // A loose list-item / stray text block: wrap its inline content (or raw
        // text) in a paragraph.
        out.push(
          t.tokens?.length
            ? paragraph(t.tokens)
            : paragraph([{ type: 'text', text: t.text ?? '' }]),
        )
        break
      default: {
        // Unknown block (e.g. html, table, custom): preserve its raw text as a
        // paragraph rather than dropping content.
        const raw = (t.text ?? t.raw ?? '').trim()
        if (raw.length) out.push({ type: 'paragraph', content: [{ type: 'text', text: raw }] })
      }
    }
  }
  return out
}

/** Minimal fallback doc wrapping raw text in a single paragraph. */
function fallbackDoc(text: string): Record<string, unknown> {
  const content = text.length > 0 ? [{ type: 'text', text }] : []
  return { type: 'doc', content: [{ type: 'paragraph', ...(content.length ? { content } : {}) }] }
}

/**
 * Parse markdown → ProseMirror JSON matching the editor's StarterKit-based
 * schema, WITHOUT importing the editor graph (server-runtime safe). Always
 * returns a valid `doc`; on any failure returns a minimal paragraph doc. NEVER
 * throws.
 */
export function markdownToJson(md: string): Record<string, unknown> {
  try {
    const tokens = marked.lexer(md, { gfm: true }) as unknown as Tok[]
    const content = blocks(tokens)
    return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
  } catch {
    return fallbackDoc(md)
  }
}
