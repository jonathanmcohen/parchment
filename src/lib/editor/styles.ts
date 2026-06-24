// G3: named styles — a pure (no db / no React) module describing reusable
// paragraph + character styles with an inherit (`basedOn`) chain. The stored
// list lives under the `docStyles` settings key; the editor's Styles dropdown
// applies a style's resolved props via the existing toolbar chain commands.

/** The formatting properties a style can carry. All optional. */
export interface StyleProps {
  fontFamily?: string
  fontSize?: string
  color?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

/** A named, reusable style. `basedOn` points at another style's id (inherit). */
export interface NamedStyle {
  id: string
  name: string
  type: 'paragraph' | 'character'
  basedOn?: string
  props: StyleProps
}

const STRING_PROP_KEYS = ['fontFamily', 'fontSize', 'color'] as const
const BOOL_PROP_KEYS = ['bold', 'italic', 'underline'] as const

/** Validate a single raw props object, dropping unknown/mistyped fields. */
function parseProps(raw: unknown): StyleProps {
  if (typeof raw !== 'object' || raw === null) return {}
  const obj = raw as Record<string, unknown>
  const out: StyleProps = {}
  for (const k of STRING_PROP_KEYS) {
    const v = obj[k]
    if (typeof v === 'string') out[k] = v
  }
  for (const k of BOOL_PROP_KEYS) {
    const v = obj[k]
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}

/** Validate one raw style entry, returning null when malformed. */
function parseStyle(raw: unknown): NamedStyle | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  const { id, name, type, basedOn } = obj
  if (typeof id !== 'string' || id === '') return null
  if (typeof name !== 'string' || name === '') return null
  if (type !== 'paragraph' && type !== 'character') return null

  const style: NamedStyle = { id, name, type, props: parseProps(obj.props) }
  if (typeof basedOn === 'string' && basedOn !== '') style.basedOn = basedOn
  return style
}

/** Parse/validate the stored styles list, dropping malformed entries. */
export function parseStyles(raw: unknown): NamedStyle[] {
  if (!Array.isArray(raw)) return []
  const out: NamedStyle[] = []
  for (const entry of raw) {
    const style = parseStyle(entry)
    if (style) out.push(style)
  }
  return out
}

/**
 * Resolve a style's EFFECTIVE props by walking the `basedOn` chain from the root
 * down, so a child overrides its parent. Cycle-safe: a repeated id stops the
 * walk. An unknown id resolves to `{}`.
 */
export function resolveStyleProps(styles: readonly NamedStyle[], id: string): StyleProps {
  const byId = new Map<string, NamedStyle>()
  for (const s of styles) byId.set(s.id, s)

  // Walk the chain from the requested style up to its root, collecting ancestors.
  const chain: NamedStyle[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.push(current)
    current = current.basedOn !== undefined ? byId.get(current.basedOn) : undefined
  }

  // Apply root → leaf so descendants override ancestors.
  const merged: StyleProps = {}
  for (let i = chain.length - 1; i >= 0; i--) {
    const node = chain[i]
    if (node) Object.assign(merged, node.props)
  }
  return merged
}

/** Built-in starter styles: two paragraph + two character. */
export const DEFAULT_STYLES: readonly NamedStyle[] = [
  {
    id: 'body',
    name: 'Body',
    type: 'paragraph',
    props: { fontFamily: '', fontSize: '12pt' },
  },
  {
    id: 'title',
    name: 'Title',
    type: 'paragraph',
    basedOn: 'body',
    props: { fontSize: '28pt', bold: true },
  },
  {
    // F4: a paragraph subtitle — larger than body, muted ink. The color uses the
    // theme's `--muted` token (no hardcoded hex) so it tracks light/dark.
    id: 'subtitle',
    name: 'Subtitle',
    type: 'paragraph',
    basedOn: 'body',
    props: { fontSize: '16pt', color: 'var(--muted)' },
  },
  {
    id: 'emphasis',
    name: 'Emphasis',
    type: 'character',
    props: { italic: true },
  },
  {
    id: 'code',
    name: 'Code',
    type: 'character',
    props: { fontFamily: 'ui-monospace, monospace', color: '#b91c1c' },
  },
]
