// F6: pure doc-link extraction. Walks a ProseMirror JSON document and collects
// the targetIds of every wikiLink atom node. No editor graph, no DB — safe to
// import anywhere (server or client). Used by saveDocument to maintain the
// doc_links index.

type PMNodeLike = {
  type?: string
  attrs?: Record<string, unknown>
  content?: unknown
}

/**
 * Walk a ProseMirror JSON tree and return the deduped, non-empty `targetId`s of
 * every `wikiLink` node, in first-seen document order. Tolerant of arbitrary
 * input shapes (never throws): non-object nodes and missing `content` arrays are
 * skipped. Empty-string targetIds (unresolved hand-typed `[[Label]]`) are
 * ignored — only links that actually point at a doc are indexed.
 */
export function extractTargetIds(contentJson: unknown): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const n = node as PMNodeLike
    if (n.type === 'wikiLink') {
      const targetId = n.attrs?.targetId
      if (typeof targetId === 'string' && targetId.length > 0 && !seen.has(targetId)) {
        seen.add(targetId)
        out.push(targetId)
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
