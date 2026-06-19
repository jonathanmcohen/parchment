import { Extension } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Slugify a heading text to a stable HTML id.
 * - Lowercase
 * - Non-alphanum/space → stripped
 * - Spaces → hyphens
 * - Collapse consecutive hyphens
 * - Trim leading/trailing hyphens
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * HeadingId — adds a stable `id` attribute to heading nodes derived from
 * their text content. De-duplicates by appending `-2`, `-3`, … suffixes.
 *
 * Used by B6 (link-to-heading), B7 (TOC), B11 (outline).
 */
export const HeadingId = Extension.create({
  name: 'headingId',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('headingId'),
        appendTransaction(_transactions, _oldState, newState) {
          const { doc, tr } = newState
          let modified = false
          const seen = new Map<string, number>()

          doc.descendants((node: Node, pos: number) => {
            if (node.type.name !== 'heading') return true

            const text = node.textContent
            const base = slugify(text) || 'heading'

            const count = (seen.get(base) ?? 0) + 1
            seen.set(base, count)
            const id = count === 1 ? base : `${base}-${count}`

            if (node.attrs.id !== id) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, id })
              modified = true
            }

            return true
          })

          return modified ? tr : null
        },
      }),
    ]
  },
})
