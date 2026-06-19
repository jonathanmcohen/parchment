/**
 * outline.ts — B11 outline pane helpers.
 *
 * Pure block-array helpers (computeSections, moveSection) are unit-testable
 * without a real ProseMirror document.  moveHeadingSection is the live
 * editor command that locates headings by id and applies a PM transaction.
 *
 * Position-drift note (same discipline as formula-cells.ts):
 *   We compute the source slice and target position BEFORE any mutation,
 *   then delete the source first when inserting before (or insert+delete when
 *   inserting after) so that position arithmetic stays consistent.
 */

import type { Editor } from '@tiptap/core'

// ── Pure block-array types ────────────────────────────────────────────────────

export interface Block {
  type: 'heading' | 'other'
  /** Only defined when type === 'heading' */
  level?: number
}

export interface Section {
  /** Index of the heading block (inclusive). */
  start: number
  /** Index of the first block NOT in this section (exclusive). */
  end: number
  /** Heading level (1–6). */
  level: number
}

// ── computeSections ───────────────────────────────────────────────────────────

/**
 * Compute one Section per heading in `blocks`.
 *
 * A section covers its heading block plus every following block until the next
 * heading whose level is ≤ this heading's level (i.e. same or higher in the
 * document hierarchy).
 *
 * Non-heading blocks at the top of the document (before the first heading) are
 * not included in any section.
 *
 * Example:
 *   [H1, p, H2, p, H1, p]
 *   → H1@0: [0,4)  H2@2: [2,4)  H1@4: [4,6)
 */
export function computeSections(blocks: Block[]): Section[] {
  const sections: Section[] = []

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block === undefined || block.type !== 'heading') continue

    const level = block.level ?? 1

    // Find the end: next heading with level ≤ this one
    let end = blocks.length
    for (let j = i + 1; j < blocks.length; j++) {
      const b = blocks[j]
      if (b === undefined) continue
      if (b.type === 'heading' && (b.level ?? 1) <= level) {
        end = j
        break
      }
    }

    sections.push({ start: i, end, level })
  }

  return sections
}

// ── moveSection ───────────────────────────────────────────────────────────────

/**
 * Move the section whose heading is at block index `fromHeadingIndex` to be
 * positioned immediately before the section whose heading is at
 * `toHeadingIndex`.  When `toHeadingIndex` equals blocks.length (past-end
 * sentinel), the section is appended at the end.
 *
 * The entire section (heading + all body blocks until the next sibling/parent
 * heading) moves as a unit.  Returns a new array; the input is not mutated.
 *
 * Throws when `fromHeadingIndex` is not the start of a section.
 */
export function moveSection(
  blocks: Block[],
  fromHeadingIndex: number,
  toHeadingIndex: number,
): Block[] {
  const sections = computeSections(blocks)

  const srcSection = sections.find((s) => s.start === fromHeadingIndex)
  if (srcSection === undefined) {
    throw new Error(`No section starts at block index ${fromHeadingIndex}`)
  }

  // Slice to extract the moving chunk
  const moving = blocks.slice(srcSection.start, srcSection.end)

  // Build result without the moving slice
  const without = [...blocks.slice(0, srcSection.start), ...blocks.slice(srcSection.end)]

  // Determine insertion point in `without` (the array after removal)
  let insertAt: number
  if (toHeadingIndex >= blocks.length) {
    // Move to end
    insertAt = without.length
  } else if (toHeadingIndex > srcSection.start) {
    // Target was after source in original array → its index shifts left by the
    // number of removed blocks
    const shift = srcSection.end - srcSection.start
    insertAt = toHeadingIndex - shift
  } else {
    insertAt = toHeadingIndex
  }

  // Guard bounds
  insertAt = Math.max(0, Math.min(insertAt, without.length))

  return [...without.slice(0, insertAt), ...moving, ...without.slice(insertAt)]
}

// ── moveHeadingSection (live PM command) ─────────────────────────────────────

/**
 * Move the heading identified by `fromHeadingId` and its whole body section
 * to the position immediately before the heading identified by `toHeadingId`.
 * When `toHeadingId` is null the section is moved to the end of the document.
 *
 * Handles PM position drift by computing positions before any mutation and
 * applying the splice in a single transaction using slice operations.
 */
export function moveHeadingSection(
  editor: Editor,
  fromHeadingId: string,
  toHeadingId: string | null,
): void {
  const { state } = editor
  const { doc, tr } = state

  // ── Collect top-level block positions ────────────────────────────────────
  interface BlockPos {
    pos: number // position of the block's open token
    size: number // nodeSize
    type: 'heading' | 'other'
    level: number
    id: string | null
  }

  const blockPositions: BlockPos[] = []

  doc.forEach((node, offset) => {
    blockPositions.push({
      pos: offset,
      size: node.nodeSize,
      type: node.type.name === 'heading' ? 'heading' : 'other',
      level: node.type.name === 'heading' ? (node.attrs.level as number) : 0,
      id: node.type.name === 'heading' ? (node.attrs.id as string | null) : null,
    })
  })

  // ── Find from/to heading indices ─────────────────────────────────────────
  const fromIdx = blockPositions.findIndex((b) => b.id === fromHeadingId)
  if (fromIdx === -1) return // heading not in doc

  let toIdx: number
  if (toHeadingId === null) {
    toIdx = blockPositions.length // sentinel: append to end
  } else {
    toIdx = blockPositions.findIndex((b) => b.id === toHeadingId)
    if (toIdx === -1) return // target not in doc
  }

  // Nothing to do if source and target are the same
  if (fromIdx === toIdx) return

  // ── Compute source section bounds ─────────────────────────────────────────
  const fromLevel = blockPositions[fromIdx]?.level ?? 1

  let sectionEndIdx = blockPositions.length
  for (let i = fromIdx + 1; i < blockPositions.length; i++) {
    const b = blockPositions[i]
    if (b === undefined) continue
    if (b.type === 'heading' && b.level <= fromLevel) {
      sectionEndIdx = i
      break
    }
  }

  // Don't move if target is within the source section (would be a no-op /
  // invalid — the whole section would be inserted inside itself)
  if (toIdx > fromIdx && toIdx < sectionEndIdx) return

  // ── Compute absolute PM positions ─────────────────────────────────────────
  // doc.content positions: block at blockPositions[i].pos occupies
  //   [pos, pos + size).  The PM doc wraps content with its own open token
  //   at position 0 (not counted in forEach offsets which start from 0 inside
  //   the doc).  forEach offsets are already absolute positions.

  const srcFrom = blockPositions[fromIdx]?.pos ?? 0
  const srcTo = (() => {
    const last = blockPositions[sectionEndIdx - 1]
    if (last === undefined) return doc.content.size
    return last.pos + last.size
  })()

  // Extract the content slice (nodes)
  const srcSlice = doc.slice(srcFrom, srcTo)

  // ── Determine insert position (in original coords, before any mutation) ───
  let insertPos: number
  if (toIdx >= blockPositions.length) {
    // Append to end of doc
    insertPos = doc.content.size
  } else {
    insertPos = blockPositions[toIdx]?.pos ?? doc.content.size
  }

  // ── Apply transaction: delete source, then insert at adjusted target ──────
  //
  // Two cases:
  //   A) Target is BEFORE source → delete source after insertion to avoid
  //      shifting the insert position.  But inserting first would shift the
  //      delete positions.  Easier: insert first (no position conflict since
  //      target < source), then delete (source shifted right by slice size).
  //
  //   B) Target is AFTER source → delete source first (no shift on target
  //      since target > source), then insert at adjusted position.

  const sliceSize = srcTo - srcFrom

  if (insertPos <= srcFrom) {
    // Case A: target before source — insert first, then delete
    tr.insert(insertPos, srcSlice.content)
    // After insertion the source section shifted right by sliceSize
    tr.delete(srcFrom + sliceSize, srcTo + sliceSize)
  } else {
    // Case B: target after source — delete first, then insert at adjusted pos
    tr.delete(srcFrom, srcTo)
    // After deletion the target position shifted left by sliceSize
    const adjustedInsert = insertPos - sliceSize
    tr.insert(adjustedInsert, srcSlice.content)
  }

  editor.view.dispatch(tr)
}
