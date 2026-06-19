// ── Track-changes pure core ────────────────────────────────────────────────
//
// Operates on ProseMirror JSON so it is unit-testable without a live editor.
// The Suggesting Tiptap extension (suggesting.ts) uses these utilities for
// accept/reject logic and for collecting the list shown in SuggestionsPanel.

export type ChangeType = 'insertion' | 'deletion'

export interface TrackedChange {
  id: string
  type: ChangeType
  from: number
  to: number
  author: string
  text: string
}

// ── Author colour palette ──────────────────────────────────────────────────

/** 12 WCAG-AA-safe colours (checked against white at 4.5:1). */
const PALETTE = [
  '#1d4ed8', // blue-700
  '#15803d', // green-700
  '#b45309', // amber-700
  '#9333ea', // purple-600
  '#be123c', // rose-700
  '#0e7490', // cyan-700
  '#7c3aed', // violet-600
  '#a16207', // yellow-700
  '#0369a1', // sky-700
  '#047857', // emerald-700
  '#c2410c', // orange-700
  '#6d28d9', // violet-700
]

/** Simple deterministic hash: djb2. */
function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ (s.charCodeAt(i) | 0)
  }
  return h >>> 0 // unsigned 32-bit
}

/** Return a stable colour hex for an author string. */
export function authorColor(author: string): string {
  const idx = hash(author) % PALETTE.length
  // PALETTE has 12 entries; idx is always 0–11
  return PALETTE[idx] ?? PALETTE[0] ?? '#1d4ed8'
}

// ── Accept / reject semantics ──────────────────────────────────────────────

/**
 * Given a resolve action + change type, return what the editor should do to
 * the document range:
 *
 * | action | type      | result                  |
 * |--------|-----------|-------------------------|
 * | accept | insertion | keep text, remove mark  |
 * | reject | insertion | remove text             |
 * | accept | deletion  | remove text             |
 * | reject | deletion  | keep text, remove mark  |
 */
export function resolveChange(
  action: 'accept' | 'reject',
  type: ChangeType,
): 'keep-text-remove-mark' | 'remove-text' {
  if (action === 'accept' && type === 'insertion') return 'keep-text-remove-mark'
  if (action === 'reject' && type === 'insertion') return 'remove-text'
  if (action === 'accept' && type === 'deletion') return 'remove-text'
  // reject deletion → keep text (remove mark)
  return 'keep-text-remove-mark'
}

// ── Doc walker ─────────────────────────────────────────────────────────────

// Minimal JSON types — we only need what PM serialises.
type PmMarkJson = {
  type: string
  attrs?: Record<string, unknown>
}
type PmNodeJson = {
  type: string
  text?: string
  marks?: PmMarkJson[]
  content?: PmNodeJson[]
}

/**
 * Walk a ProseMirror JSON document and collect all text runs that carry an
 * `insertion` or `deletion` mark.  Contiguous runs with the same (type,
 * author) are merged into one `TrackedChange`.
 *
 * Positions are absolute doc positions (matching ProseMirror's counting
 * where every node boundary costs 1).
 */
export function collectChanges(json: unknown): TrackedChange[] {
  const results: TrackedChange[] = []

  // Walk, threading the absolute pos through.
  // Returns the size consumed (like ProseMirror nodeSize).
  function walk(node: PmNodeJson, pos: number): number {
    if (node.type === 'doc') {
      let cur = 0
      for (const child of node.content ?? []) {
        cur += walk(child, pos + cur)
      }
      return cur
    }

    if (node.type === 'text') {
      const text = node.text ?? ''
      const size = text.length
      // Check marks
      const suggestMark = (node.marks ?? []).find(
        (m) => m.type === 'insertion' || m.type === 'deletion',
      )
      if (suggestMark) {
        const type = suggestMark.type as ChangeType
        const author = (suggestMark.attrs?.author as string | undefined) ?? ''
        // Merge with previous change if contiguous + same type + same author
        const prev = results[results.length - 1]
        if (prev && prev.type === type && prev.author === author && prev.to === pos) {
          prev.to = pos + size
          prev.text += text
        } else {
          results.push({
            id: `${type}-${pos}-${author}`,
            type,
            from: pos,
            to: pos + size,
            author,
            text,
          })
        }
      }
      return size
    }

    // Block / inline node: wrapping open (1) + content + close (1) = nodeSize
    // For leaf nodes (no content array) nodeSize is 1.
    if (!node.content || node.content.length === 0) {
      // Leaf node (image, hardBreak, etc.): size 1
      return 1
    }

    // Non-text node with content: pos+1 is the first child position.
    let inner = 0
    for (const child of node.content) {
      inner += walk(child, pos + 1 + inner)
    }
    return 1 + inner + 1
  }

  const root = json as PmNodeJson
  walk(root, 0)

  return results
}
