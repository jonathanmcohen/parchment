// D3 version history — pure diff utilities (no db import; safe anywhere).
// Uses jsdiff (diff@9) for line-level diffing.

import { createTwoFilesPatch, diffLines } from 'diff'

export interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  text: string
}

/**
 * A single line from a unified diff patch, classified by kind.
 * - 'add'     lines beginning with '+'  (but not '+++')
 * - 'del'     lines beginning with '-'  (but not '---')
 * - 'hunk'    lines beginning with '@@'
 * - 'meta'    '---' / '+++' header lines
 * - 'context' anything else (unchanged lines, index lines, etc.)
 */
export interface UnifiedHunkLine {
  kind: 'add' | 'del' | 'hunk' | 'meta' | 'context'
  text: string
}

/**
 * Split a unified-patch string into typed lines for per-line colouring.
 * Pure function — safe to call anywhere.
 */
export function parseUnifiedHunks(patch: string): UnifiedHunkLine[] {
  const lines = patch.split('\n')
  // Drop trailing empty element produced by a trailing newline.
  const trimmed = lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines
  return trimmed.map((text): UnifiedHunkLine => {
    if (text.startsWith('+++') || text.startsWith('---')) {
      return { kind: 'meta', text }
    }
    if (text.startsWith('+')) {
      return { kind: 'add', text }
    }
    if (text.startsWith('-')) {
      return { kind: 'del', text }
    }
    if (text.startsWith('@@')) {
      return { kind: 'hunk', text }
    }
    return { kind: 'context', text }
  })
}

/**
 * Produce a flat array of DiffLine objects from two markdown strings.
 * Each line of each hunk is emitted as a separate DiffLine.
 */
export function diffMarkdown(oldMd: string, newMd: string): DiffLine[] {
  const hunks = diffLines(oldMd, newMd)
  const result: DiffLine[] = []

  for (const hunk of hunks) {
    const lines = hunk.value.split('\n')
    // diffLines includes a trailing empty string when the value ends with '\n'
    const trimmed = lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines

    for (const text of trimmed) {
      if (hunk.added) {
        result.push({ type: 'add', text })
      } else if (hunk.removed) {
        result.push({ type: 'del', text })
      } else {
        result.push({ type: 'ctx', text })
      }
    }
  }

  return result
}

/**
 * Produce a unified-diff patch string from two markdown strings.
 * oldLabel / newLabel default to 'old' / 'new' if omitted.
 */
export function unifiedPatch(
  oldMd: string,
  newMd: string,
  oldLabel?: string,
  newLabel?: string,
): string {
  return createTwoFilesPatch(oldLabel ?? 'old', newLabel ?? 'new', oldMd, newMd, '', '', {
    context: 3,
  })
}
