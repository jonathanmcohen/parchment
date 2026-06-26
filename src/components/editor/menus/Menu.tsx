'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMenuDismiss } from '@/components/shell/use-menu-dismiss'
import { useMenuKeyboard } from '@/components/shell/use-menu-keyboard'
import { getThemedPortalRoot } from '@/components/ui/themed-portal'

// S3-2: the shared, accessible dropdown-menu primitive (the load-bearing NEW
// component the menu bar / toolbar overflow consume). It does NOT define its own
// elevation: it styles the panel with the shared `.px-menu` shell + the S1
// `--shadow-dropdown` token (DECISION 6 — S5-3 owns/finalizes that shell). It
// reuses the established S2 a11y hooks so there is ONE menu behavior in the tree:
//   • useMenuKeyboard — focus-into-menu, ↑↓/Home/End roving, Tab-trap, disabled
//     rows skipped (role="menu"/"menuitem").
//   • useMenuDismiss — outside-click + Esc-close + focus-restore to the trigger.
//
// No feature logic: every non-placeholder row re-surfaces an EXISTING handler
// (the S3-2 wiring table). Placeholder rows render aria-disabled + a "coming
// soon" hint — visibly inert, never a dead no-op (placeholder honesty).

export type MenuItemConfig =
  | {
      kind?: 'action'
      label: string
      /** Existing handler this row re-surfaces. */
      onSelect?: () => void
      /** Download/navigation link (export rows). */
      href?: string
      download?: boolean
      /** Optional Material Symbols icon name. */
      icon?: string
      /** Keyboard-shortcut hint shown right-aligned. */
      shortcut?: string
      /** Disabled placeholder — visibly inert, "coming soon". */
      disabled?: boolean
      /** Hint shown for a disabled placeholder (e.g. "Coming soon"). */
      hint?: string
    }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; icon?: string; items: MenuItemConfig[] }

export type MenuConfig = {
  /** Top-level label shown in the menu bar (File / Edit / …). */
  label: string
  items: MenuItemConfig[]
}

function MenuRows({ items, close }: { items: MenuItemConfig[]; close: () => void }) {
  return (
    <>
      {items.map((item, i) => {
        if (item.kind === 'separator') {
          // Native <hr> carries the separator role without needing aria-valuenow.
          // biome-ignore lint/suspicious/noArrayIndexKey: static config, order-stable
          return <hr key={`sep-${i}`} className="px-menu-separator" />
        }

        if (item.kind === 'submenu') {
          return (
            <div key={item.label} role="none" className="px-menu-group">
              <div className="px-menu-group-label" aria-hidden>
                {item.label}
              </div>
              <MenuRows items={item.items} close={close} />
            </div>
          )
        }

        const disabled = item.disabled === true

        // Download/navigation link rows (export). Rendered as <a> so the browser
        // performs the download natively; still role="menuitem" for the model.
        if (item.href && !disabled) {
          return (
            <a
              key={item.label}
              role="menuitem"
              tabIndex={-1}
              href={item.href}
              {...(item.download ? { download: true } : {})}
              className="px-menu-item"
              onClick={close}
            >
              {item.icon && (
                <span aria-hidden className="material-symbols-rounded px-menu-item-icon">
                  {item.icon}
                </span>
              )}
              <span className="px-menu-item-label">{item.label}</span>
              {item.shortcut && <span className="px-menu-item-shortcut">{item.shortcut}</span>}
            </a>
          )
        }

        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={disabled}
            aria-disabled={disabled || undefined}
            className="px-menu-item"
            onClick={
              disabled
                ? undefined
                : () => {
                    close()
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
    </>
  )
}

/**
 * A single top-level menu (trigger + dropdown panel). The menu bar renders one
 * per top item; the toolbar overflow renders one with a `⋯` trigger.
 */
export function Menu({
  label,
  items,
  triggerClassName = 'parchment-menubar-item',
  triggerContent,
  triggerAriaLabel,
  align = 'start',
}: {
  label: string
  items: MenuItemConfig[]
  /** Class for the trigger button (menu-bar item vs. the toolbar ⋯ button). */
  triggerClassName?: string
  /** Custom trigger content (e.g. the ⋯ glyph); defaults to the label text. */
  triggerContent?: React.ReactNode
  /** aria-label when the trigger content is an icon, not text. */
  triggerAriaLabel?: string
  /**
   * Panel anchoring. 'start' (default) left-anchors the dropdown to the
   * trigger; 'end' right-anchors it (grows leftward) so a trigger pinned to
   * the far-right toolbar edge does not overflow the viewport (P2/v0.1.7).
   */
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  // v0.1.9 #1: the OPEN panel is portalled to a body-level overlay root and
  // positioned `fixed` from the trigger's measured rect. This escapes the
  // toolbar's `overflow-x:auto` clip (an absolute panel inside it grew a
  // scrollbar) and lets a far-right trigger's panel grow leftward without
  // overflowing the viewport. `null` until the panel is open + measured.
  const [panelPos, setPanelPos] = useState<React.CSSProperties | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // Measure the trigger and derive the fixed panel coordinates. `align==='end'`
  // pins the panel's RIGHT edge to the trigger's right (grows leftward); `start`
  // pins the LEFT edge to the trigger's left. `top` sits 4px under the trigger.
  const measure = useCallback(() => {
    const rect = toggleRef.current?.getBoundingClientRect()
    if (!rect) return
    const base: React.CSSProperties = { position: 'fixed', top: rect.bottom + 4 }
    setPanelPos(
      align === 'end'
        ? { ...base, right: window.innerWidth - rect.right }
        : { ...base, left: rect.left },
    )
  }, [align])

  // Measure synchronously before paint on open so the panel never flashes at the
  // origin, and re-measure while open if the page scrolls or the window resizes
  // (the toolbar is sticky; the document scrolls under it).
  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null)
      return
    }
    measure()
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    // `true` (capture) so we still reposition when an inner scroll container —
    // not just the window — scrolls under the open menu.
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open, measure])

  // The portalled panel is NOT a DOM descendant of the wrap, so the outside-click
  // dismiss must treat it as "inside" too — pass it as the extra exempt node.
  useMenuDismiss(open, () => setOpen(false), wrapRef, toggleRef, menuRef)
  useMenuKeyboard(open, menuRef)

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setOpen(true)
    }
  }

  const close = () => setOpen(false)

  const portalRoot = open ? getThemedPortalRoot() : null
  // Render the panel on the FIRST `open` render (not gated on panelPos) so its
  // ref attaches during that commit — `useMenuKeyboard`'s effect (deps [open])
  // then finds the menu and moves focus into it. Until the layout-effect measure
  // lands the real coords, hide it (visibility:hidden) to avoid a flash at the
  // origin; useLayoutEffect runs before paint, so the hidden frame isn't seen.
  const panel = open ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={label}
      // `.parchment-menu-dropdown-fixed` carries `position:fixed`; the measured
      // top/left|right come in via inline style. The `-end` class is no longer
      // needed for anchoring (the rect math handles it).
      className="px-menu parchment-menu-dropdown-fixed"
      style={panelPos ?? { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
    >
      <MenuRows items={items} close={close} />
    </div>
  ) : null

  return (
    <div ref={wrapRef} className="parchment-menu-wrap">
      <button
        ref={toggleRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        {...(triggerAriaLabel ? { 'aria-label': triggerAriaLabel } : {})}
        className={triggerClassName}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        {triggerContent ?? label}
      </button>

      {portalRoot && panel ? createPortal(panel, portalRoot) : null}
    </div>
  )
}
