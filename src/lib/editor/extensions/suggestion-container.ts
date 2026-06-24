// V1/V1b: where @tiptap/suggestion mounts its floating popups.
//
// By default createMount() appends the popup to `document.body` — which sits
// OUTSIDE the (app) layout's themed wrapper (src/app/(app)/layout.tsx sets
// `style={themeCssVars}` + `data-color-scheme` on a div INSIDE <body>). A
// body-mounted popup therefore resolves the :root (light) CSS custom properties,
// so in dark mode it renders white-bg + light-gray text → illegible (confirmed:
// computed --surface #fff, --foreground #e8eaed on the slash menu).
//
// Anchoring the mount inside the themed wrapper makes --surface/--foreground/
// --muted/--border-chrome resolve to the active scheme. Floating UI's
// resolveContainer accepts a selector string and resolves it at mount time, so no
// per-editor ref threading is needed. The wrapper is a plain <div> with no
// position/transform/overflow — a safe positioning container.
//
// CONSTRAINT: do NOT give the [data-color-scheme] wrapper position/transform/
// overflow/clip — that would shift or clip these floating menus.
export const SUGGESTION_CONTAINER = '[data-color-scheme]'
