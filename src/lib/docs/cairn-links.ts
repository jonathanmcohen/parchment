// J1: pure cairn-link extraction. Walks a ProseMirror JSON document and collects
// the (sanitized) pageIds of every cairnLink atom node. No editor graph, no DB,
// no network — safe to import anywhere (server or client). Mirrors doc-links.ts
// extractTargetIds; used by saveDocument to maintain the cairn_links index.

import { isValidCairnPageId } from '@/lib/integrations/cairn'

type PMNodeLike = {
  type?: string
  attrs?: Record<string, unknown>
  content?: unknown
}

/**
 * Walk a ProseMirror JSON tree and return the deduped, VALIDATED `pageId`s of
 * every `cairnLink` node, in first-seen document order. wikiLink nodes are
 * IGNORED (this is the Cairn graph, not the wiki graph). Tolerant of arbitrary
 * input shapes (never throws): non-object nodes and missing `content` arrays are
 * skipped.
 *
 * A cairnLink's pageId is ALWAYS already-sanitized in a well-formed doc (insert
 * and parse both sanitize), so here we VALIDATE-and-DROP rather than salvage: an
 * id that fails isValidCairnPageId (traversal / injection / overlong / empty /
 * unsanitized) is dropped entirely — never silently rewritten into a different
 * id and never stored in cairn_links. Only safe ids are indexed.
 */
export function extractCairnPageIds(contentJson: unknown): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const n = node as PMNodeLike
    if (n.type === 'cairnLink') {
      const pageId = n.attrs?.pageId
      if (isValidCairnPageId(pageId) && !seen.has(pageId)) {
        seen.add(pageId)
        out.push(pageId)
      }
    }
    const content = n.content
    if (Array.isArray(content)) {
      for (const child of content) visit(child)
    }
  }

  visit(contentJson)
  return out
}
