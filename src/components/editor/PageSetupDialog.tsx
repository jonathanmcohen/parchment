'use client'

import { useId, useState } from 'react'
import {
  cmToPx,
  DEFAULT_PAGE_SETUP,
  inToPx,
  type Margins,
  type Orientation,
  PAGE_SIZES,
  type PageSetup,
  type PageSizeName,
  pxToCm,
  pxToIn,
  resolvePageDims,
} from '@/lib/editor/paginate'

type Unit = 'in' | 'cm'

type Props = {
  /** Current page setup — used to seed the form. */
  initial?: PageSetup
  onApply: (setup: PageSetup) => void
  onClose: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pxToDisplay(px: number, unit: Unit): number {
  const raw = unit === 'in' ? pxToIn(px) : pxToCm(px)
  return Math.round(raw * 1000) / 1000
}

function displayToPx(value: number, unit: Unit): number {
  return unit === 'in' ? inToPx(value) : cmToPx(value)
}

function convertMargins(
  margins: Margins,
  unit: Unit,
): { top: number; right: number; bottom: number; left: number } {
  return {
    top: pxToDisplay(margins.top, unit),
    right: pxToDisplay(margins.right, unit),
    bottom: pxToDisplay(margins.bottom, unit),
    left: pxToDisplay(margins.left, unit),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PageSetupDialog({ initial = DEFAULT_PAGE_SETUP, onApply, onClose }: Props) {
  const titleId = useId()
  const sizeId = useId()
  const orientId = useId()
  const unitId = useId()
  const customWId = useId()
  const customHId = useId()
  const topId = useId()
  const rightId = useId()
  const bottomId = useId()
  const leftId = useId()

  const [size, setSize] = useState<PageSizeName>(initial.size)
  const [orientation, setOrientation] = useState<Orientation>(initial.orientation)
  const [unit, setUnit] = useState<Unit>('in')

  // Custom dimensions — stored as display values in current unit; seeded from initial.
  const initResolved = resolvePageDims(initial)
  const [customW, setCustomW] = useState<number>(() => pxToDisplay(initResolved.widthPx, 'in'))
  const [customH, setCustomH] = useState<number>(() => pxToDisplay(initResolved.heightPx, 'in'))

  // Margin display values in current unit.
  const [margins, setMargins] = useState<{
    top: number
    right: number
    bottom: number
    left: number
  }>(() => convertMargins(initial.margins, 'in'))

  // When unit toggles, convert displayed values without changing canonical px.
  const toggleUnit = () => {
    const next: Unit = unit === 'in' ? 'cm' : 'in'
    // Convert custom dims
    const wPx = displayToPx(customW, unit)
    const hPx = displayToPx(customH, unit)
    setCustomW(pxToDisplay(wPx, next))
    setCustomH(pxToDisplay(hPx, next))
    // Convert margins
    const marginsPx: Margins = {
      top: displayToPx(margins.top, unit),
      right: displayToPx(margins.right, unit),
      bottom: displayToPx(margins.bottom, unit),
      left: displayToPx(margins.left, unit),
    }
    setMargins(convertMargins(marginsPx, next))
    setUnit(next)
  }

  const handleApply = () => {
    const wPx = displayToPx(customW, unit)
    const hPx = displayToPx(customH, unit)
    const setup: PageSetup = {
      size,
      orientation,
      widthPx: wPx,
      heightPx: hPx,
      margins: {
        top: displayToPx(margins.top, unit),
        right: displayToPx(margins.right, unit),
        bottom: displayToPx(margins.bottom, unit),
        left: displayToPx(margins.left, unit),
      },
    }
    onApply(setup)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  const setMargin = (key: keyof typeof margins, val: number) =>
    setMargins((prev) => ({ ...prev, [key]: val }))

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX
    <div
      role="presentation"
      className="parchment-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="parchment-dialog parchment-page-setup-dialog"
        onKeyDown={handleKeyDown}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Page setup
          </h2>
          <button
            type="button"
            aria-label="Close page setup dialog"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* ── Page size ─────────────────────────────────────────────────── */}
        <div className="parchment-dialog-field">
          <label htmlFor={sizeId} className="parchment-dialog-label">
            Page size
          </label>
          <select
            id={sizeId}
            value={size}
            onChange={(e) => setSize(e.target.value as PageSizeName)}
            className="parchment-dialog-select"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Custom dimensions — revealed only for 'Custom' size */}
        {size === 'Custom' && (
          <div className="parchment-page-setup-custom-dims">
            <div className="parchment-dialog-field">
              <label htmlFor={customWId} className="parchment-dialog-label">
                Width ({unit})
              </label>
              <input
                id={customWId}
                type="number"
                min={0.5}
                step={0.1}
                value={customW}
                onChange={(e) => setCustomW(Number(e.target.value))}
                className="parchment-dialog-input parchment-page-setup-num"
              />
            </div>
            <div className="parchment-dialog-field">
              <label htmlFor={customHId} className="parchment-dialog-label">
                Height ({unit})
              </label>
              <input
                id={customHId}
                type="number"
                min={0.5}
                step={0.1}
                value={customH}
                onChange={(e) => setCustomH(Number(e.target.value))}
                className="parchment-dialog-input parchment-page-setup-num"
              />
            </div>
          </div>
        )}

        {/* ── Orientation ───────────────────────────────────────────────── */}
        <fieldset className="parchment-dialog-field parchment-page-setup-orient-group">
          <legend className="parchment-dialog-label" id={orientId}>
            Orientation
          </legend>
          <label className="parchment-page-setup-radio-label">
            <input
              type="radio"
              name="orientation"
              value="portrait"
              checked={orientation === 'portrait'}
              onChange={() => setOrientation('portrait')}
            />
            Portrait
          </label>
          <label className="parchment-page-setup-radio-label">
            <input
              type="radio"
              name="orientation"
              value="landscape"
              checked={orientation === 'landscape'}
              onChange={() => setOrientation('landscape')}
            />
            Landscape
          </label>
        </fieldset>

        {/* ── Unit toggle ───────────────────────────────────────────────── */}
        <div className="parchment-dialog-field parchment-dialog-field--inline">
          <span id={unitId} className="parchment-dialog-label">
            Unit
          </span>
          <button
            type="button"
            aria-label={`Unit: ${unit}, click to toggle`}
            aria-describedby={unitId}
            className="parchment-unit-btn"
            onClick={toggleUnit}
          >
            {unit}
          </button>
        </div>

        {/* ── Margins ───────────────────────────────────────────────────── */}
        <fieldset className="parchment-dialog-field parchment-page-setup-margins-group">
          <legend className="parchment-dialog-label">Margins ({unit})</legend>
          <div className="parchment-page-setup-margins-grid">
            <div className="parchment-dialog-field">
              <label htmlFor={topId} className="parchment-dialog-label">
                Top
              </label>
              <input
                id={topId}
                type="number"
                min={0}
                step={0.1}
                value={margins.top}
                onChange={(e) => setMargin('top', Number(e.target.value))}
                className="parchment-dialog-input parchment-page-setup-num"
              />
            </div>
            <div className="parchment-dialog-field">
              <label htmlFor={rightId} className="parchment-dialog-label">
                Right
              </label>
              <input
                id={rightId}
                type="number"
                min={0}
                step={0.1}
                value={margins.right}
                onChange={(e) => setMargin('right', Number(e.target.value))}
                className="parchment-dialog-input parchment-page-setup-num"
              />
            </div>
            <div className="parchment-dialog-field">
              <label htmlFor={bottomId} className="parchment-dialog-label">
                Bottom
              </label>
              <input
                id={bottomId}
                type="number"
                min={0}
                step={0.1}
                value={margins.bottom}
                onChange={(e) => setMargin('bottom', Number(e.target.value))}
                className="parchment-dialog-input parchment-page-setup-num"
              />
            </div>
            <div className="parchment-dialog-field">
              <label htmlFor={leftId} className="parchment-dialog-label">
                Left
              </label>
              <input
                id={leftId}
                type="number"
                min={0}
                step={0.1}
                value={margins.left}
                onChange={(e) => setMargin('left', Number(e.target.value))}
                className="parchment-dialog-input parchment-page-setup-num"
              />
            </div>
          </div>
        </fieldset>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="parchment-dialog-actions">
          <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="parchment-dialog-btn-primary" onClick={handleApply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
