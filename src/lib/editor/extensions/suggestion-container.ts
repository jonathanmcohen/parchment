// V1/V1b → v0.1.9 #9: where @tiptap/suggestion mounts its floating popups
// (slash / wiki / cite / cairn).
//
// HISTORY:
//   By default createMount() appends the popup to `document.body` — which sits
//   OUTSIDE the (app) layout's themed wrapper, so in dark mode the popup
//   resolved the :root (light) CSS custom properties → illegible (white bg +
//   light-gray text). V1 fixed that by anchoring the mount INSIDE the
//   `[data-color-scheme]` wrapper via a selector string.
//
//   But the wrapper sits in the page's normal flow, so the popup's z-index:9999
//   then competed with in-page Tiptap NodeView stacking contexts
//   (`.parchment-cb-wrapper` is `position:relative; overflow:hidden`; the TOC
//   node) and painted BEHIND them (#9).
//
// FIX (#9): mount into the body-level themed overlay root instead — a DIRECT
// child of <body>, so no sibling stacking context can sit above it and
// z-index:9999 wins over all editor content. The overlay root carries the
// active theming attributes ([data-color-scheme]/[data-high-contrast]/
// [data-font]), so dark/HC/dyslexic tokens still resolve (the whole point of the
// V1 wrapper mount is preserved — see themed-portal.ts).
//
// @tiptap/suggestion's `resolveContainer` accepts an HTMLElement directly, so we
// hand it the live overlay node. Floating UI still positions the popup with its
// default `absolute` strategy against the offset parent; the overlay root is a
// plain static <div> (no position/transform/overflow), so positioning is
// identical to the old wrapper mount — only the stacking parent changes.
//
// CONSTRAINT (unchanged): the overlay root must NOT get position/transform/
// overflow/clip — that would shift or clip these caret-tracked menus.

import { getThemedPortalRoot } from '@/components/ui/themed-portal'
import { MOBILE_BREAKPOINT } from '@/lib/editor/mobile-toolbar'

/**
 * The HTMLElement @tiptap/suggestion mounts its popup into. Returns the
 * body-level themed overlay root (with the active scheme attrs freshly synced),
 * falling back to `document.body` if it cannot be created (it always can,
 * client-side). Call at mount time so the scheme attrs reflect a runtime theme
 * switch.
 */
export function getSuggestionContainer(): HTMLElement {
  return getThemedPortalRoot() ?? document.body
}

// v0.2.10 mobile pass: keep the caret-anchored suggestion popups (slash / wiki /
// cite / cairn) fully on-screen on a phone. @tiptap/suggestion's default managed
// positioning anchors the popup at the caret with a `bottom-start` placement but no
// viewport-shift, so near the left/right/bottom edge of a ~380px screen the popup
// can land partly (or wholly) off-screen. We can't append a Floating-UI `shift()`
// middleware without taking a direct dependency on `@floating-ui/dom` (a transitive
// package), so instead we use the plugin's `onPosition` hook: when provided, the
// plugin hands us the computed x/y and stops writing them itself, letting us CLAMP
// the popup into the viewport before applying. Desktop is unaffected — the clamp
// only kicks in at ≤MOBILE_BREAKPOINT, and even then only moves a popup that would
// otherwise overflow.

/** Gutter (px) kept between a clamped popup and the viewport edge. */
const VIEWPORT_GUTTER = 8

/**
 * A `SuggestionMountOptions.onPosition` handler that applies the plugin-computed
 * coordinates to `element`, clamped into the viewport on mobile so the popup is
 * never off-screen. The plugin uses the `absolute` strategy against a body-level
 * static container, so the coordinates are page coords — we clamp against the
 * current scroll offset + viewport size.
 *
 * @param element the popup element the plugin mounted (the `.react-renderer` wrap).
 */
export function clampSuggestionPosition(element: HTMLElement) {
  return ({ x, y }: { x: number; y: number }) => {
    let left = x
    let top = y
    if (typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT) {
      const rect = element.getBoundingClientRect()
      const w = rect.width || element.offsetWidth || 0
      const h = rect.height || element.offsetHeight || 0
      const minLeft = window.scrollX + VIEWPORT_GUTTER
      const maxLeft = window.scrollX + window.innerWidth - w - VIEWPORT_GUTTER
      const minTop = window.scrollY + VIEWPORT_GUTTER
      const maxTop = window.scrollY + window.innerHeight - h - VIEWPORT_GUTTER
      // Only clamp when there is room; if the popup is wider/taller than the
      // viewport, prefer pinning to the leading/top edge (min) so its start is seen.
      left = maxLeft > minLeft ? Math.min(Math.max(x, minLeft), maxLeft) : minLeft
      top = maxTop > minTop ? Math.min(Math.max(y, minTop), maxTop) : minTop
    }
    element.style.left = `${left}px`
    element.style.top = `${top}px`
  }
}
