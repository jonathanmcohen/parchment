// S3-3: pure layout logic for the editor toolbar's overflow `⋯` menu.
//
// The toolbar is a single non-wrapping 48px row. When the viewport is too
// narrow to show every control, the trailing controls that do not fit collapse
// into a `⋯` dropdown (which reuses the S3-2 menu primitive). This helper is the
// only place that decides which controls go inline and which go to overflow.
//
// Invariant (the "toolbar overflow breakage" failure mode): every control id
// appears in EXACTLY one bucket — never dropped, never duplicated. The overflow
// bucket is exactly the ordered set of controls that did not fit.
//
// No feature logic — pure measurement math, unit-tested at three widths.

export type ToolbarControl = {
  /** Stable id used to render the control once (inline OR in the ⋯ menu). */
  id: string
  /** Measured width in px of the control (icon button, select, chip, etc.). */
  width: number
}

export type ToolbarPartition<T extends ToolbarControl> = {
  inline: T[]
  overflow: T[]
}

/**
 * Partition an ordered control list into the controls that fit inline and the
 * trailing controls that overflow into the `⋯` menu.
 *
 * @param controls    ordered controls (left → right), each with a measured width
 * @param available   the toolbar's available inner width in px
 * @param overflowBtnWidth  px reserved for the `⋯` trigger when anything overflows
 */
export function partitionControls<T extends ToolbarControl>(
  controls: readonly T[],
  available: number,
  overflowBtnWidth: number,
): ToolbarPartition<T> {
  // Fast path: everything fits with no `⋯` button needed.
  const total = controls.reduce((sum, c) => sum + c.width, 0)
  if (available >= total) {
    return { inline: [...controls], overflow: [] }
  }

  // Something will overflow → reserve room for the `⋯` trigger, then greedily
  // place controls inline until the next one would not fit. Everything after the
  // first control that does not fit goes to overflow (preserving order so a
  // control never reappears earlier inline than a sibling that was kept).
  const budget = available - overflowBtnWidth
  const inline: T[] = []
  const overflow: T[] = []
  let used = 0
  let overflowing = false

  for (const c of controls) {
    if (!overflowing && used + c.width <= budget) {
      inline.push(c)
      used += c.width
    } else {
      overflowing = true
      overflow.push(c)
    }
  }

  return { inline, overflow }
}
