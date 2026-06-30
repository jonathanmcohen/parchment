// v0.2.7 #6: shared geometry for the editor right-rail panels (Version history,
// Comments, …). Pure (no React, no DOM) so it is unit-testable and so the sticky
// math lives in exactly one place.
//
// The editor is a single WINDOW-scroll layout (`.parchment-canvas-gutter` is
// `overflow:visible`), and each right rail is a normal-flow flex sibling. Without
// `position:sticky` the panel scrolls away with the page, so on a long document
// its top sits far above the fold and the user must scroll up to reach it. Making
// the panel `position:sticky` against the window pins it to the viewport at any
// scroll position.
//
// The sticky `top` must clear the sticky chrome stack (title 56 + menu 32 +
// toolbar 48 = 136px) so the panel does not hide behind it; `maxHeight` is the
// remaining viewport so the panel's own list scrolls internally instead of
// overflowing off-screen.

import type { CSSProperties } from 'react'

/** Height (px) of the sticky editor chrome stack (title + menu + toolbar). */
export const EDITOR_CHROME_STACK_PX = 136

export interface SidePanelStyleOptions {
  /** Panel width in px (Version history = 300, Comments = 280, …). */
  width: number
  /**
   * When false the panel is rendered NON-sticky (mobile / narrow). Sticky is
   * gated to desktop because at ≤768px a pinned 280–300px panel would cover the
   * document. Defaults to true (desktop).
   */
  sticky?: boolean
  /** Chrome-stack offset to pin below; defaults to {@link EDITOR_CHROME_STACK_PX}. */
  chromePx?: number
}

/**
 * The inline style for an editor right-rail `<aside>`. Shared by VersionHistory
 * and CommentsSidebar so both get the same "reachable from any scroll position"
 * behaviour from one definition.
 *
 * Sticky branch (desktop): `position:sticky; top:<chrome>; align-self:flex-start;
 * max-height:calc(100vh - <chrome>); overflow-y:auto` — pins the panel to the
 * viewport just under the chrome and lets its content scroll internally.
 *
 * Non-sticky branch (mobile): the prior in-flow behaviour (no sticky, no
 * max-height cap) so a narrow viewport is never covered by a pinned panel.
 */
export function sidePanelStyle(opts: SidePanelStyleOptions): CSSProperties {
  const { width, sticky = true, chromePx = EDITOR_CHROME_STACK_PX } = opts
  const base: CSSProperties = {
    width,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderLeft: '1px solid var(--border, #e5e7eb)',
    background: 'var(--surface, #fff)',
    overflowY: 'auto',
    padding: '8px 0',
  }
  if (!sticky) return base
  return {
    ...base,
    position: 'sticky',
    top: chromePx,
    alignSelf: 'flex-start',
    maxHeight: `calc(100vh - ${chromePx}px)`,
  }
}
