// J3-2: a lightweight, dependency-free read-only preview of a template's
// ProseMirror `doc` JSON. It renders just the node types the builtin templates
// use (doc/paragraph/heading/bulletList/listItem/text) — enough for a gallery
// thumbnail without instantiating a full Tiptap editor. Unknown node types are
// skipped, so it can never throw on an unexpected shape. Pure presentational
// client component; never touches @/db.

interface PMNode {
  type?: string
  text?: string
  attrs?: { level?: number }
  content?: PMNode[]
}

function renderInline(nodes: PMNode[] | undefined): string {
  if (!Array.isArray(nodes)) return ''
  return nodes.map((n) => (n.type === 'text' ? (n.text ?? '') : renderInline(n.content))).join('')
}

function renderBlock(node: PMNode, key: number): React.ReactNode {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(Math.max(node.attrs?.level ?? 2, 1), 6)
      const text = renderInline(node.content)
      const size = level <= 1 ? '0.95rem' : level === 2 ? '0.85rem' : '0.78rem'
      return (
        <p key={key} style={{ fontWeight: 700, fontSize: size, margin: '0.4em 0 0.2em' }}>
          {text}
        </p>
      )
    }
    case 'paragraph': {
      const text = renderInline(node.content)
      return (
        <p key={key} style={{ margin: '0.2em 0', minHeight: text ? undefined : '0.6em' }}>
          {text}
        </p>
      )
    }
    case 'bulletList':
      return (
        <ul key={key} style={{ margin: '0.2em 0', paddingLeft: '1.1em', listStyle: 'disc' }}>
          {(node.content ?? []).map((li, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static template data — list items have no stable id and never reorder
            <li key={`${key}-${i}`}>{renderInline(li.content?.[0]?.content)}</li>
          ))}
        </ul>
      )
    default:
      return null
  }
}

interface Props {
  doc: { content?: PMNode[] } | null | undefined
}

export function TemplatePreview({ doc }: Props) {
  const blocks = Array.isArray(doc?.content) ? doc.content : []
  return (
    <div
      data-template-preview
      style={{
        fontSize: '0.72rem',
        lineHeight: 1.45,
        color: 'var(--foreground)',
        maxHeight: 180,
        overflow: 'hidden',
        background: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: '0.375rem',
        padding: '0.6rem 0.75rem',
      }}
    >
      {blocks.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Empty document</p>
      ) : (
        blocks.map((b, i) => renderBlock(b, i))
      )}
    </div>
  )
}
