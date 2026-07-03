'use client'

import { useEffect, useState } from 'react'
import { MOBILE_BREAKPOINT } from '@/lib/editor/mobile-toolbar'

// v0.2.10 mobile pass: a matchMedia-driven `≤breakpoint` hook that gates the
// editor toolbar's compact/mobile render branch. matchMedia (not a ResizeObserver
// on a layout box) is used deliberately — it reflects the VIEWPORT width and never
// feeds back on layout, dodging the G12 ResizeObserver loop the toolbar overflow
// notes warn about.
//
// SSR-safe: renders as `false` (desktop) on the server + first client paint, then
// syncs to the real match in a layout-safe effect. Because the desktop and mobile
// toolbars share the same underlying handlers (the mobile branch only re-groups the
// SAME controls), a one-frame desktop-first paint on a phone is invisible and never
// hydration-mismatches (the initial render matches the server's `false`).

/**
 * True when the viewport is at or below `breakpoint` px. Defaults to the shared
 * MOBILE_BREAKPOINT (768) so JS gating matches the globals.css media queries.
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const sync = () => setIsMobile(mql.matches)
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [breakpoint])

  return isMobile
}
