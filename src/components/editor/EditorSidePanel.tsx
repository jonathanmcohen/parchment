'use client'

// v0.2.7 #6: shared wrapper for the editor right-rail panels (Version history,
// Comments, …). DRY: both rails were hand-rolled non-sticky `<aside>`s that
// scrolled away on a long doc (you had to scroll back up to reach them). This
// wrapper gives them ONE definition of the "sticky, reachable from any scroll
// position" behaviour.
//
// Sticky is the desktop default (inline style from sidePanelStyle). The mobile
// de-sticky is done in CSS via the `.parchment-side-panel` class (globals.css
// @media ≤768px resets position/max-height) so a narrow viewport is never
// covered by a pinned panel — no JS/resize listener needed, SSR-safe.

import type { ReactNode } from 'react'
import { sidePanelStyle } from '@/components/editor/side-panel-style'

interface Props {
  ariaLabel: string
  /** Panel width in px (Version history = 300, Comments = 280). */
  width: number
  children: ReactNode
}

export function EditorSidePanel({ ariaLabel, width, children }: Props) {
  return (
    <aside
      aria-label={ariaLabel}
      className="parchment-side-panel"
      style={sidePanelStyle({ width })}
    >
      {children}
    </aside>
  )
}
