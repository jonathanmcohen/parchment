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
