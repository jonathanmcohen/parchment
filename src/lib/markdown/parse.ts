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
// round-trips. Parchment's custom blocks (page/section breaks, footnotes, TOC,
// formula tables) do NOT reverse-parse yet — that is F3 (lossless canonical
// form). Acceptable for F2.

import { marked } from 'marked'

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
        out.push(
          ...inline(t.tokens, [...marks, { type: 'link', attrs: { href: t.href ?? '' } }]),
        )
        break
      case 'br':
        out.push({ type: 'hardBreak' })
        break
      default: {
        // text / escape / html / anything else: emit its nested inline tokens if
        // present, else its literal text.
        if (t.tokens && t.tokens.length > 0) {
          out.push(...inline(t.tokens, marks))
        } else {
          const n = textNode(t.text ?? '', marks)
          if (n) out.push(n)
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
      case 'paragraph':
        out.push(paragraph(t.tokens))
        break
      case 'code': {
        const code = t.text ?? ''
        out.push({
          type: 'codeBlock',
          attrs: { language: t.lang && t.lang.length ? t.lang : null },
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
        out.push(t.tokens && t.tokens.length ? paragraph(t.tokens) : paragraph([{ type: 'text', text: t.text ?? '' }]))
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
