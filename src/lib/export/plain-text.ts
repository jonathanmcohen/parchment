/** Convert a PM doc JSON to plain UTF-8 text: headings/paragraphs → lines
 *  (blank line between blocks), bulletList/orderedList → "- "/"1. " prefixed
 *  lines, blockquote → "> ", codeBlock → the code, tables → tab-separated
 *  rows, drop marks. Never throws. */

type PMNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: { type?: string }[]
}

function nodeText(node: PMNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(nodeText).join('')
}

function tableCellText(cell: PMNode): string {
  return (cell.content ?? [])
    .map((block) => nodeText(block))
    .join(' ')
    .trim()
}

function tableRowText(row: PMNode): string {
  return (row.content ?? []).map(tableCellText).join('\t')
}

function listItemText(item: PMNode, marker: string): string {
  const blocks = item.content ?? []
  if (blocks.length === 0) return marker
  const first = blocks[0] ? blockToText(blocks[0]) : ''
  const rest = blocks.slice(1).map(blockToText)
  const lines = [marker + first, ...rest.filter((s) => s.length > 0)].join('\n')
  return lines
}

function blockToText(node: PMNode): string {
  switch (node.type) {
    case 'heading':
    case 'paragraph':
      return nodeText(node)
    case 'blockquote':
      return (node.content ?? [])
        .map(blockToText)
        .join('\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    case 'codeBlock':
      return (node.content ?? []).map(nodeText).join('')
    case 'bulletList':
      return (node.content ?? []).map((li) => listItemText(li, '- ')).join('\n')
    case 'orderedList':
      return (node.content ?? []).map((li, i) => listItemText(li, `${i + 1}. `)).join('\n')
    case 'table': {
      const rows: string[] = []
      for (const row of node.content ?? []) {
        if (row.type === 'tableRow') {
          rows.push(tableRowText(row))
        } else if (row.type === 'tableHeader' || row.type === 'tableBody') {
          // handle thead/tbody wrappers if any
          for (const inner of row.content ?? []) {
            if (inner.type === 'tableRow') rows.push(tableRowText(inner))
          }
        }
      }
      return rows.join('\n')
    }
    case 'horizontalRule':
    case 'pageBreak':
      return '---'
    default:
      // Fallback: gather all text from children
      return (node.content ?? []).map(blockToText).join('\n')
  }
}

export function docToPlainText(doc: unknown): string {
  try {
    if (!doc || typeof doc !== 'object') return ''
    const root = doc as PMNode
    const blocks = root.type === 'doc' ? (root.content ?? []) : []
    if (blocks.length === 0) return ''
    const lines = blocks.map(blockToText).filter((s) => s.length > 0)
    if (lines.length === 0) return ''
    return `${lines.join('\n\n')}\n`
  } catch {
    return ''
  }
}
