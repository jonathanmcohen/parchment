'use client'

import { type ReactNode, useEffect, useState } from 'react'

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
// The narrow drawer is the S2-6 slice; the editor-chrome reflow remainder is
// logged PARTIAL in scope.md (it leans on S3-3's `⋯` overflow, not yet built).
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

  // Close the drawer on Escape (narrow-viewport overlay is modal-ish).
  useEffect(() => {
    if (!drawerOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen])

  return (
    <div
      className="parchment-app-shell flex min-h-screen"
      data-drawer-open={drawerOpen || undefined}
    >
      <aside
        // K5/RTL: border-e (inline-end) so the divider flips under dir="rtl".
        className="parchment-sidebar flex w-64 shrink-0 flex-col gap-1 border-[var(--border)] border-e bg-[var(--surface)] p-4"
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
            type="button"
            aria-label={drawerOpen ? menuLabels.closeNav : menuLabels.openNav}
            aria-expanded={drawerOpen}
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
