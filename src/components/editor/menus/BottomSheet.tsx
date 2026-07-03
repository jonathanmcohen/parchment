'use client'

import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { MenuItemConfig } from '@/components/editor/menus/Menu'
import { useModalOverlay } from '@/components/shell/use-modal-overlay'
import { getThemedPortalRoot } from '@/components/ui/themed-portal'

// v0.2.10 mobile pass: a bottom sheet for the editor toolbar's `⋯` on phones. It
// holds the non-essential controls (see mobile-toolbar.ts) as tappable rows.
//
// Reuses the established overlay patterns so there is ONE overlay behaviour:
//   • portals to the body-level `#parchment-overlay-root` (getThemedPortalRoot),
//     which mirrors the [data-color-scheme]/[data-high-contrast]/[data-font] attrs
//     so dark tokens resolve and the sheet escapes the toolbar's overflow clip;
//   • useModalOverlay — body-scroll lock, Tab focus-trap, focus-in / restore,
//     Esc-to-close (the same hook the AppShell drawer uses);
//   • the shared `.px-menu-item` row shell so rows look identical to the desktop ⋯.
//
// It renders the SAME MenuItemConfig list the desktop overflow `⋯` uses — no new
// feature logic, just a phone-shaped surface for it.

export function BottomSheet({
  open,
  title,
  items,
  onClose,
}: {
  open: boolean
  /** Accessible name for the dialog + the visible sheet header. */
  title: string
  /** The rows to render (the same config the desktop overflow Menu consumes). */
  items: MenuItemConfig[]
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useModalOverlay({ open, panelRef, onClose })

  if (!open) return null
  const portalRoot = getThemedPortalRoot()
  if (!portalRoot) return null

  const sheet = (
    <div className="parchment-bottom-sheet-layer">
      {/* Scrim — closes on tap. A sibling of the sheet so a sheet tap doesn't bubble
          to it. */}
      <button
        type="button"
        aria-label="Close"
        className="parchment-bottom-sheet-scrim"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-labelledby={titleId}
        className="parchment-bottom-sheet px-menu"
      >
        <div className="parchment-bottom-sheet-grip" aria-hidden="true" />
        <div className="parchment-bottom-sheet-header">
          <span id={titleId} className="parchment-bottom-sheet-title">
            {title}
          </span>
          <button
            type="button"
            aria-label="Close"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            <span aria-hidden className="material-symbols-rounded">
              close
            </span>
          </button>
        </div>

        <div className="parchment-bottom-sheet-body" role="menu" aria-label={title}>
          {items.map((item, i) => {
            if (item.kind === 'separator') {
              // biome-ignore lint/suspicious/noArrayIndexKey: static config, order-stable
              return <hr key={`sep-${i}`} className="px-menu-separator" />
            }
            // Submenus aren't used by the toolbar overflow config; render their
            // children flat if one ever appears (defensive, keeps every id reachable).
            if (item.kind === 'submenu') {
              return (
                <div key={item.label} role="none" className="px-menu-group">
                  <div className="px-menu-group-label" aria-hidden>
                    {item.label}
                  </div>
                </div>
              )
            }

            const disabled = item.disabled === true
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={disabled}
                aria-disabled={disabled || undefined}
                className="px-menu-item parchment-bottom-sheet-item"
                onClick={
                  disabled
                    ? undefined
                    : () => {
                        // Close first (restores focus to the trigger), then run the
                        // action — matches the desktop Menu's close-then-select order.
                        onClose()
                        item.onSelect?.()
                      }
                }
              >
                {item.icon && (
                  <span aria-hidden className="material-symbols-rounded px-menu-item-icon">
                    {item.icon}
                  </span>
                )}
                <span className="px-menu-item-label">{item.label}</span>
                {disabled && item.hint && <span className="px-menu-item-hint">{item.hint}</span>}
                {!disabled && item.shortcut && (
                  <span className="px-menu-item-shortcut">{item.shortcut}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  return createPortal(sheet, portalRoot)
}
