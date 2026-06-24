// S3-5: derive the active outline row from the cursor position.
//
// "Which heading is the cursor in" is pure derived state — the active heading is
// the last heading at or before the cursor. When the cursor is above every
// heading, the first heading is the nearest section, so it is active.
//
// This is computed inside the existing `editor.on('update')` /selection handler
// (no new effect, no self-triggering loop — the G7/G8 outline lessons). Heading
// document positions are resolved from the live PM doc at call time, not from a
// cached JSON shape.

export type HeadingPos = {
  id: string
  /** Document position of the heading node (ascending in reading order). */
  pos: number
}

/**
 * Return the id of the heading whose section the cursor sits in, or null when
 * there are no headings.
 */
export function activeHeadingId(headings: readonly HeadingPos[], cursorPos: number): string | null {
  if (headings.length === 0) return null
  const sorted = [...headings].sort((a, b) => a.pos - b.pos)

  let active: string | null = null
  for (const h of sorted) {
    if (h.pos <= cursorPos) {
      active = h.id
    } else {
      break
    }
  }
  // Cursor above the first heading → the first heading is the nearest section.
  return active ?? sorted[0]?.id ?? null
}
