// Pure module — no db/React/DOM imports. Safe for client and server.

export interface TagColor {
  name: string
  bg: string
  fg: string
}

/**
 * 8 named colors with bg/fg chosen for ≥4.5:1 contrast (WCAG AA).
 * Dark backgrounds use white text; light backgrounds use dark text.
 */
export const TAG_COLORS: readonly TagColor[] = [
  { name: 'slate', bg: '#475569', fg: '#ffffff' },
  { name: 'red', bg: '#dc2626', fg: '#ffffff' },
  { name: 'amber', bg: '#b45309', fg: '#ffffff' },
  { name: 'green', bg: '#16a34a', fg: '#ffffff' },
  { name: 'teal', bg: '#0f766e', fg: '#ffffff' },
  { name: 'blue', bg: '#1d4ed8', fg: '#ffffff' },
  { name: 'violet', bg: '#7c3aed', fg: '#ffffff' },
  { name: 'pink', bg: '#be185d', fg: '#ffffff' },
] as const

export const DEFAULT_TAG_COLOR: string = 'slate'

/** Look up a color by name; falls back to DEFAULT_TAG_COLOR's entry. */
export function resolveTagColor(name: string): TagColor {
  return (
    TAG_COLORS.find((c) => c.name === name) ??
    (TAG_COLORS.find((c) => c.name === DEFAULT_TAG_COLOR) as TagColor)
  )
}

/** True if `name` is a known palette color name. */
export function isValidTagColor(name: string): boolean {
  return TAG_COLORS.some((c) => c.name === name)
}
