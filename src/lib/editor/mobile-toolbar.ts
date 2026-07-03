// v0.2.10 mobile pass: shared constants for the editor toolbar at ≤768px.
//
// On a phone the desktop-dense toolbar (font/size/colour selects + ~30 action
// buttons) can't fit a single non-scrolling row. Instead of the pre-v0.2.10
// horizontal-scroll behaviour, the mobile toolbar (Toolbar.tsx `isMobile` branch)
// shows a fixed COMPACT row of essentials and folds everything else into a `⋯`
// bottom sheet.
//
// The essentials set is the contract between the render (which lays out exactly
// these controls, in order) and the tests (which assert the row matches). Keeping
// it here — rather than inline in the 1000-line Toolbar — makes it a single,
// testable source of truth. No React/DOM deps.

/**
 * The mobile-layout breakpoint in px. Matches `isMobileWidth`'s default (page-fit.ts)
 * and the `@media (max-width: 768px)` rules in globals.css so JS gating and CSS
 * gating agree on the same threshold.
 */
export const MOBILE_BREAKPOINT = 768

/**
 * The compact essentials, in the order they appear in the mobile row. Everything
 * NOT in this set folds into the `⋯` bottom sheet. Chosen per the v0.2.10 spec:
 * undo/redo · style dropdown · B/I/U · lists · link · image · comment.
 *
 * The Toolbar mobile branch renders exactly these (a component test pins that the
 * rendered row's controls equal this list), then a `⋯` trigger.
 */
export const MOBILE_ESSENTIAL_IDS = [
  'undo',
  'redo',
  'styles',
  'bold',
  'italic',
  'underline',
  'bulletList',
  'orderedList',
  'link',
  'image',
  'comment',
] as const

export type MobileEssentialId = (typeof MOBILE_ESSENTIAL_IDS)[number]

/**
 * The accessible name (aria-label / trigger text) each essential id renders with,
 * so a DOM test can assert the compact row without reaching into the component. The
 * Styles control is a dropdown whose trigger text is "Styles".
 */
export const MOBILE_ESSENTIAL_LABELS: Record<MobileEssentialId, string> = {
  undo: 'Undo',
  redo: 'Redo',
  styles: 'Styles',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  bulletList: 'Bullet list',
  orderedList: 'Numbered list',
  link: 'Link',
  image: 'Insert image',
  comment: 'Add comment',
}
