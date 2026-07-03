// v0.2.10 mobile pass: focus-trap primitives shared by the off-canvas drawer and
// the toolbar `⋯` bottom sheet (both modal overlays).
//
// `nextTrapIndex` is the pure wrap-around index math (unit-tested, no DOM).
// `getFocusableElements` is the DOM query the modal-overlay hook feeds it — kept
// here so the selector lives in one place. The hook (use-modal-overlay.ts) wires
// them to a keydown handler.

export type TrapDirection = 'forward' | 'backward'

/**
 * The destination index for a trapped Tab / Shift+Tab, cycling within `count`
 * focusable elements.
 *
 * @param currentIndex index of the currently-focused element within the trap, or
 *                     -1 when focus is outside the trap.
 * @param count        number of focusable elements in the trap.
 * @param direction    'forward' (Tab) or 'backward' (Shift+Tab).
 * @returns the destination index in [0, count), or -1 when there is nothing to focus.
 */
export function nextTrapIndex(
  currentIndex: number,
  count: number,
  direction: TrapDirection,
): number {
  if (count <= 0) return -1
  if (count === 1) return 0

  if (currentIndex < 0) {
    // Focus is outside the trap → enter at the leading (forward) or trailing edge.
    return direction === 'forward' ? 0 : count - 1
  }

  if (direction === 'forward') {
    return currentIndex + 1 >= count ? 0 : currentIndex + 1
  }
  return currentIndex - 1 < 0 ? count - 1 : currentIndex - 1
}

// Elements that can receive keyboard focus. Mirrors the well-known focus-trap
// selector set; `:not([disabled])` / negative-tabindex exclusions keep inert
// controls out of the cycle.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * The visible, focusable descendants of `container`, in DOM order. Elements hidden
 * via `display:none` / `visibility:hidden` (offsetParent === null, and not the
 * container itself) are skipped so the trap never focuses an invisible control.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return nodes.filter((el) => {
    if (el.hasAttribute('disabled')) return false
    if (el.getAttribute('aria-hidden') === 'true') return false
    // offsetParent is null for display:none subtrees (and for position:fixed, which
    // we don't use inside these overlays); treat a measured zero-box as hidden too.
    const hidden = el.offsetParent === null && el.getClientRects().length === 0
    return !hidden
  })
}
