/**
 * Pure helpers for multi-select state. No React, no DB, no DOM.
 * Used by FileManager.tsx and unit-tested independently.
 */

/**
 * Return the slice of `orderedIds` from `anchorId` to `targetId` inclusive.
 * The slice is order-agnostic with respect to which endpoint comes first in the
 * array — whichever is encountered first defines the start.
 * Returns [] when either id is not found in `orderedIds`.
 */
export function rangeBetween(orderedIds: string[], anchorId: string, targetId: string): string[] {
  const anchorIdx = orderedIds.indexOf(anchorId)
  const targetIdx = orderedIds.indexOf(targetId)
  if (anchorIdx === -1 || targetIdx === -1) return []
  const start = Math.min(anchorIdx, targetIdx)
  const end = Math.max(anchorIdx, targetIdx)
  return orderedIds.slice(start, end + 1)
}

/**
 * Toggle membership of `id` in `selection`. Always returns a NEW Set so that
 * React state updates trigger re-renders. The input set is not mutated.
 */
export function toggle(selection: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selection)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  return next
}

/**
 * The single-click-select reducer (S5-5): collapse selection to exactly `id`,
 * discarding any prior selection. A plain left-click on a file row selects only
 * that row (Drive semantics), so this takes no prior set. Returns a fresh Set.
 */
export function selectOnly(id: string): Set<string> {
  return new Set([id])
}
