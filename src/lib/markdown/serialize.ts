// B0 baseline: one-way ProseMirror-JSON → canonical markdown (for disk-mirror +
// full-text search). Bidirectional/lossless round-trip is Plan F.

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
    default:
      return serializeInline(node.content)
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
