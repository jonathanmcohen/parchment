import type { EditorState } from '@tiptap/pm/state'

// Find the table node that contains the current selection — not merely the
// first table in the document (a doc can hold several). Returns the node and
// its absolute start position, or null when the selection is outside a table.
export function findSelectedTable(state: EditorState): { node: unknown; pos: number } | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'table') {
      return { node, pos: $from.before(depth) }
    }
  }
  return null
}
