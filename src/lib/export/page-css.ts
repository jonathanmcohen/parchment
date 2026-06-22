import type { PageSetup } from '@/lib/editor/paginate'

// Named page dimensions in their print units.
// Letter and Legal use inches; A4 and Tabloid use mm.
// Portrait orientation (landscape swaps width/height).
const NAMED_DIMS: Record<string, { w: string; h: string }> = {
  Letter: { w: '8.5in', h: '11in' },
  A4: { w: '210mm', h: '297mm' },
  Legal: { w: '8.5in', h: '14in' },
  Tabloid: { w: '11in', h: '17in' },
}

const DEFAULT_RULE = '@page { size: 8.5in 11in; margin: 1in 1in 1in 1in; }'

/** Convert pixels (96 dpi) to a rounded inch string. */
function pxToInStr(px: number): string {
  return `${(px / 96).toFixed(4).replace(/\.?0+$/, '')}in`
}

/**
 * Build the `@page` CSS rule (size + margins) for print from a PageSetup.
 * Examples:
 *   Letter portrait → `@page { size: 8.5in 11in; margin: 1in 1in 1in 1in; }`
 *   A4 landscape    → `@page { size: 297mm 210mm; margin: ...; }`
 *   Custom          → dimensions computed from stored px values at 96 dpi.
 * Never throws — returns the default Letter rule on invalid input.
 */
export function pageCss(setup: PageSetup): string {
  try {
    if (!setup || typeof setup !== 'object') return DEFAULT_RULE

    const { size, orientation, margins, widthPx, heightPx } = setup

    // Resolve size string
    let sizeStr: string
    if (size === 'Custom') {
      // Custom dimensions stored in portrait; landscape swaps them.
      const w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 816
      const h = typeof heightPx === 'number' && heightPx > 0 ? heightPx : 1056
      if (orientation === 'landscape') {
        sizeStr = `${pxToInStr(h)} ${pxToInStr(w)}`
      } else {
        sizeStr = `${pxToInStr(w)} ${pxToInStr(h)}`
      }
    } else {
      const dims = NAMED_DIMS[size]
      if (!dims) return DEFAULT_RULE
      const { w, h } = dims
      sizeStr = orientation === 'landscape' ? `${h} ${w}` : `${w} ${h}`
    }

    // Resolve margins (stored in px at 96 dpi)
    const m =
      margins && typeof margins === 'object'
        ? margins
        : { top: 96, right: 96, bottom: 96, left: 96 }
    const top = typeof m.top === 'number' && m.top >= 0 ? m.top : 96
    const right = typeof m.right === 'number' && m.right >= 0 ? m.right : 96
    const bottom = typeof m.bottom === 'number' && m.bottom >= 0 ? m.bottom : 96
    const left = typeof m.left === 'number' && m.left >= 0 ? m.left : 96

    const marginStr = `${pxToInStr(top)} ${pxToInStr(right)} ${pxToInStr(bottom)} ${pxToInStr(left)}`

    return `@page { size: ${sizeStr}; margin: ${marginStr}; }`
  } catch {
    return DEFAULT_RULE
  }
}
