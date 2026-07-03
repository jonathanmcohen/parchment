'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useModalOverlay } from '@/components/shell/use-modal-overlay'

// S2-6: responsive chrome shell.
//
// The (app) layout is an async server component; the drawer open/close state is
// client. This wrapper owns that state and lays out the three regions:
//   • <aside> sidebar  — always-on rail >= 768px; a slide-in overlay/drawer
//     behind a hamburger < 768px (content goes full-width).
//   • top bar          — hosts the hamburger (narrow only) on the left and the
//     UserCluster slot on the right, above the page content.
//   • <main>           — the routed page content.
//
// No new feature logic — pure layout/visibility behavior on existing chrome.
//
// v0.2.10 mobile pass: the open narrow drawer is now a proper modal overlay —
// aria-modal dialog, Tab focus-trap, body-scroll lock, focus-in / restore-to-
// hamburger, Esc/scrim close — via the shared useModalOverlay hook (also used by
// the toolbar `⋯` bottom sheet). The hamburger is `display:none` at ≥768px, so the
// drawer can only be opened at mobile widths; the modal semantics never engage on
// desktop (where the sidebar is a static rail).
//
// The actual media-query rules live in globals.css (`.parchment-app-shell`,
// `.parchment-sidebar`, `.parchment-menu-toggle`, `.parchment-scrim`) so the
// breakpoints are token-driven CSS, not JS width math (avoids the G12
// ResizeObserver feedback loop).
export function AppShell({
  sidebar,
  topbarRight,
  menuLabels,
  children,
}: {
  sidebar: ReactNode
  topbarRight: ReactNode
  menuLabels: { openNav: string; closeNav: string }
  children: ReactNode
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  const closeDrawer = () => setDrawerOpen(false)

  // Modal-overlay behaviour for the OPEN drawer: focus-trap, body-scroll lock,
  // focus-in-on-open, restore-to-hamburger + Esc-to-close on unmount/close. The
  // hamburger is the return-focus target.
  useModalOverlay({
    open: drawerOpen,
    panelRef: drawerRef,
    onClose: closeDrawer,
    returnFocusRef: toggleRef,
  })

  // Belt-and-suspenders: if the viewport is resized up to desktop while the drawer
  // is open (hamburger becomes display:none), close it so no orphaned modal state
  // lingers behind a now-static rail.
  useEffect(() => {
    if (!drawerOpen || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mql = window.matchMedia('(min-width: 768px)')
    const onChange = () => {
      if (mql.matches) setDrawerOpen(false)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [drawerOpen])

  return (
    <div
      className="parchment-app-shell flex min-h-screen"
      data-drawer-open={drawerOpen || undefined}
    >
      <aside
        ref={drawerRef}
        // K5/RTL: border-e (inline-end) so the divider flips under dir="rtl".
        className="parchment-sidebar flex w-64 shrink-0 flex-col gap-1 border-[var(--border)] border-e bg-[var(--surface)] p-4"
        // v0.2.10: when open as the mobile drawer, expose modal-dialog semantics.
        // Only applied while open — at ≥768px the drawer never opens, so the rail
        // keeps its plain landmark role.
        {...(drawerOpen
          ? { role: 'dialog', 'aria-modal': true, 'aria-label': menuLabels.openNav }
          : {})}
      >
        {sidebar}
      </aside>

      {/* Scrim — only painted under the open narrow drawer (CSS gates it). */}
      <button
        type="button"
        aria-label={menuLabels.closeNav}
        tabIndex={drawerOpen ? 0 : -1}
        className="parchment-scrim"
        onClick={() => setDrawerOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="parchment-topbar flex h-12 shrink-0 items-center justify-between gap-2 px-4">
          <button
            ref={toggleRef}
            type="button"
            aria-label={drawerOpen ? menuLabels.closeNav : menuLabels.openNav}
            aria-expanded={drawerOpen}
            aria-haspopup="dialog"
            className="parchment-menu-toggle items-center justify-center rounded-full text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <span aria-hidden className="material-symbols-rounded text-[24px]">
              menu
            </span>
          </button>
          <div className="ms-auto flex items-center">{topbarRight}</div>
        </div>

        <main id="main-content" className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
