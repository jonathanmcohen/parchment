/**
 * G12: Mobile page-fit utilities — pure functions, no React/DOM deps.
 */

/** Minimum scale floor — prevents pages from becoming illegibly tiny. */
const SCALE_FLOOR = 0.2

/**
 * The scale to fit a fixed-width page into an available width, clamped to (0, 1].
 * Never upscales (max 1). Accounts for a horizontal gutter on each side.
 *
 * @param availableWidthPx - Total width of the container in pixels.
 * @param pageWidthPx      - Intrinsic width of the page element.
 * @param gutterPx         - Horizontal gutter on each side (default 8px per side).
 * @returns Scale factor in (SCALE_FLOOR, 1].
 */
export function pageFitScale(availableWidthPx: number, pageWidthPx: number, gutterPx = 8): number {
  // Guard: non-finite or zero page width → safe default (no scaling).
  if (!Number.isFinite(pageWidthPx) || pageWidthPx <= 0) return 1
  // Guard: non-finite or negative available width → safe default.
  if (!Number.isFinite(availableWidthPx) || availableWidthPx <= 0) return 1

  // Desktop: page fits without scaling.
  if (availableWidthPx >= pageWidthPx) return 1

  const usable = availableWidthPx - 2 * Math.max(0, gutterPx)
  const raw = usable / pageWidthPx
  // Clamp to [SCALE_FLOOR, 1] — never upscale, never shrink to nothing.
  return Math.min(1, Math.max(SCALE_FLOOR, raw))
}

/**
 * True when the viewport should use the mobile layout.
 *
 * @param viewportWidthPx - Current viewport / container width in pixels.
 * @param breakpointPx    - Breakpoint threshold in pixels (default 768).
 */
export function isMobileWidth(viewportWidthPx: number, breakpointPx = 768): boolean {
  return viewportWidthPx <= breakpointPx
}

/**
 * Classify a touch swipe gesture as a page navigation intent.
 *
 * Rules:
 * - Multi-touch (pinch) → 'none'
 * - |dx| < threshold    → 'none'
 * - |dy| >= |dx|        → 'none' (predominantly vertical)
 * - dx < 0 (left swipe) → 'next'
 * - dx > 0 (right swipe)→ 'prev'
 *
 * @param dx        - Horizontal displacement (end.x - start.x).
 * @param dy        - Vertical displacement (end.y - start.y).
 * @param threshold - Minimum |dx| to qualify as a swipe (default 60px).
 */
export function classifySwipe(dx: number, dy: number, threshold = 60): 'next' | 'prev' | 'none' {
  if (Math.abs(dx) < threshold) return 'none'
  if (Math.abs(dy) >= Math.abs(dx)) return 'none'
  return dx < 0 ? 'next' : 'prev'
}
