// v0.1.9 (#1, #9): a single, body-level overlay layer that ANY floating menu can
// portal into — the toolbar/menu-bar dropdowns (the shared `Menu`) and the
// editor's @tiptap/suggestion popups (slash / wiki / cite / cairn).
//
// WHY a top-level portal:
//   #1 — the shared Menu rendered its panel `position:absolute` inside
//        `.parchment-menu-wrap` inside `.parchment-toolbar`, which is
//        `overflow-x:auto`. An open panel added scrollable overflow → the
//        toolbar grew a horizontal scrollbar. Portalling the OPEN panel to the
//        body escapes that clipping/overflow context entirely.
//   #9 — the suggestion menus were mounted into the `[data-color-scheme]` theme
//        wrapper (so dark tokens resolve). But that wrapper sits in the page's
//        normal flow, so the menu's `z-index:9999` competed with in-page Tiptap
//        NodeView stacking contexts (`.parchment-cb-wrapper` is
//        `position:relative; overflow:hidden`; the TOC node) and painted BEHIND
//        them. A direct child of <body> has no such sibling stacking context, so
//        z-index:9999 wins above all editor content.
//
// WHY it must carry the theming attrs:
//   The colour tokens (--surface / --foreground / --surface-hover /
//   --border-chrome / --shadow-dropdown / --muted / --primary-surface*) are keyed
//   off [data-color-scheme] / [data-high-contrast] / [data-font] in tokens.css —
//   the rules set the tokens ON the element bearing the attribute (and, for
//   `system`, via an @media block that also targets [data-color-scheme="system"]
//   directly). So an overlay root that copies those three attributes resolves the
//   ACTIVE scheme at body level, exactly as the wrapper does. We re-copy on every
//   access so a runtime theme switch (light↔dark, HC toggle, dyslexic font) is
//   reflected the next time any overlay opens. (--font-ui, --font-body and the
//   :root:has(...) fallbacks cascade from <html>/<:root> to <body> for free.)

const OVERLAY_ROOT_ID = 'parchment-overlay-root'

// The theming attributes the (app) layout sets on its [data-color-scheme]
// wrapper. We mirror exactly these onto the overlay root.
const THEME_ATTRS = ['data-color-scheme', 'data-high-contrast', 'data-font'] as const

/**
 * Returns the singleton body-level overlay root, creating it on first call, and
 * synchronises the current theme attributes onto it each time it is accessed.
 *
 * SSR-guarded: returns `null` when there is no DOM (the callers — React
 * createPortal in the open Menu panel, and @tiptap/suggestion's `container` —
 * only run client-side, but the guard keeps this importable from server code).
 */
export function getThemedPortalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null

  let root = document.getElementById(OVERLAY_ROOT_ID)
  if (!root) {
    root = document.createElement('div')
    root.id = OVERLAY_ROOT_ID
    // No position/transform/overflow: floating menus position themselves
    // (React Menu via fixed inline style; suggestions via Floating UI's
    // `absolute` strategy resolving against the offset parent). A static,
    // unclipped body child preserves both — matching the old wrapper mount,
    // which was likewise a plain static <div>.
    document.body.appendChild(root)
  }

  // Re-copy the active theming attrs from the live theme wrapper on every
  // access, so overlays opened after a runtime theme change paint correctly.
  const wrapper = document.querySelector('[data-color-scheme]')
  for (const attr of THEME_ATTRS) {
    const value = wrapper?.getAttribute(attr)
    if (value == null) {
      root.removeAttribute(attr)
    } else {
      root.setAttribute(attr, value)
    }
  }

  return root
}
