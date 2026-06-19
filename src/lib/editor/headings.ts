import { slugify } from '@/lib/editor/extensions/heading-id'

export type HeadingEntry = { level: number; text: string; id: string }

type JsonNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  text?: string
}

/**
 * Collect heading entries from a ProseMirror/Tiptap doc JSON.
 * Ids are slugged and de-duplicated the same way HeadingId does at runtime,
 * so anchor hrefs generated here match the rendered heading ids.
 */
export function collectHeadings(json: unknown): HeadingEntry[] {
  const entries: HeadingEntry[] = []
  const seen = new Map<string, number>()

  function textOf(node: JsonNode): string {
    if (node.text !== undefined) return node.text
    return (node.content ?? []).map((c) => textOf(c)).join('')
  }

  function walk(node: JsonNode): void {
    if (node.type === 'heading') {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
      const text = textOf(node)
      const base = slugify(text) || 'heading'
      const count = (seen.get(base) ?? 0) + 1
      seen.set(base, count)
      const id = count === 1 ? base : `${base}-${count}`
      entries.push({ level, text, id })
    }
    for (const child of node.content ?? []) {
      walk(child)
    }
  }

  walk(json as JsonNode)
  return entries
}
