// S5-3 (DECISION 6 — OWNER of the shared overlay shell): the single dropdown
// surface every menu consumes. The elevation/radius/row CSS lives in
// globals.css (.px-menu / .px-menu-item), consuming the S1 --shadow-dropdown
// token. S2-1 (mega-menu) and S3-2/S3-3 (menu bar / toolbar ⋯) already render
// the `.px-menu` class directly; this component packages that same shell for the
// file-manager ContextMenu + TagPopover so all overlays share one elevation.
//
// Thin and presentational: it forwards a ref (so consumers keep their existing
// outside-click / Escape / arrow-key handling on the contained buttons), applies
// `.px-menu`, and lets the caller own positioning (fixed/absolute) via `style`
// + extra `className`. No new behavior.

import { forwardRef } from 'react'

export type DropdownProps = {
  children: React.ReactNode
  /** ARIA role for the surface — `menu` (action list) or `dialog` (e.g. tag picker). */
  role?: 'menu' | 'dialog'
  'aria-label'?: string
  className?: string
  style?: React.CSSProperties
}

export const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(function Dropdown(
  { children, role = 'menu', className, style, ...rest },
  ref,
) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is always `menu` or `dialog` (both support aria-label); biome can't statically narrow the dynamic role prop
    <div
      ref={ref}
      role={role}
      aria-label={rest['aria-label']}
      className={className ? `px-menu ${className}` : 'px-menu'}
      style={style}
    >
      {children}
    </div>
  )
})
