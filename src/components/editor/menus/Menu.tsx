'use client'

import { useId, useRef, useState } from 'react'
import { useMenuDismiss } from '@/components/shell/use-menu-dismiss'
import { useMenuKeyboard } from '@/components/shell/use-menu-keyboard'

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
}: {
  label: string
  items: MenuItemConfig[]
  /** Class for the trigger button (menu-bar item vs. the toolbar ⋯ button). */
  triggerClassName?: string
  /** Custom trigger content (e.g. the ⋯ glyph); defaults to the label text. */
  triggerContent?: React.ReactNode
  /** aria-label when the trigger content is an icon, not text. */
  triggerAriaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useMenuDismiss(open, () => setOpen(false), wrapRef, toggleRef)
  useMenuKeyboard(open, menuRef)

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setOpen(true)
    }
  }

  const close = () => setOpen(false)

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

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="px-menu parchment-menu-dropdown"
        >
          <MenuRows items={items} close={close} />
        </div>
      )}
    </div>
  )
}
