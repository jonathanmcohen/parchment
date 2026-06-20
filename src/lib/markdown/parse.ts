// F2: reverse of serialize.ts — markdown → ProseMirror JSON (server-side).
//
// Pipeline: marked.parse(md) → HTML → @tiptap/html generateJSON(html, schema).
// @tiptap/html resolves to its Node build (a server DOM) so generateJSON works
// without a browser. This is the parse half of the disk reverse-sync.
//
// FIDELITY BOUNDARY: standard markdown (headings, paragraphs, lists,
// bold/italic/code, blockquote, code fences, links) round-trips. Parchment's
// custom blocks (page/section breaks, footnotes, TOC, formula tables) do NOT
// reverse-parse yet — that is F3 (lossless canonical form). Acceptable for F2.

import { generateJSON } from '@tiptap/html'
import { marked } from 'marked'
import { baseExtensions } from '@/lib/editor/tiptap-extensions'

/** Minimal fallback doc that wraps raw text in a single paragraph. */
function fallbackDoc(text: string): Record<string, unknown> {
  const content = text.length > 0 ? [{ type: 'text', text }] : []
  return {
    type: 'doc',
    content: [{ type: 'paragraph', ...(content.length ? { content } : {}) }],
  }
}

/**
 * Parse markdown → ProseMirror JSON using the editor's `baseExtensions` schema.
 * Always returns a valid doc JSON. On ANY failure (marked error, generateJSON
 * error, unexpected output) returns a minimal doc wrapping the raw text in a
 * paragraph. NEVER throws.
 */
export function markdownToJson(md: string): Record<string, unknown> {
  try {
    const html = marked.parse(md, { async: false, gfm: true })
    const json = generateJSON(html, baseExtensions)
    // generateJSON returns Record<string, any>; guard against a non-doc result.
    if (json && typeof json === 'object' && (json as { type?: unknown }).type === 'doc') {
      return json as Record<string, unknown>
    }
    return fallbackDoc(md)
  } catch {
    return fallbackDoc(md)
  }
}
