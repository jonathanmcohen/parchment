import { describe, expect, it } from 'vitest'
import {
  MOBILE_BREAKPOINT,
  MOBILE_ESSENTIAL_IDS,
  MOBILE_ESSENTIAL_LABELS,
} from '@/lib/editor/mobile-toolbar'

// v0.2.10 mobile pass — the editor toolbar at ≤768px shows a COMPACT essentials
// row (undo/redo · styles · B/I/U · lists · link · image · comment) and folds
// everything else into a `⋯` bottom sheet. These pin the shared contract the
// Toolbar mobile branch renders against; a jsdom render test (toolbar-mobile.test)
// asserts the actual DOM matches this list.

describe('MOBILE_BREAKPOINT', () => {
  it('is 768 (matches isMobileWidth default + the globals.css media query)', () => {
    expect(MOBILE_BREAKPOINT).toBe(768)
  })
})

describe('MOBILE_ESSENTIAL_IDS', () => {
  it('lists the compact-row essentials the spec requires, in order', () => {
    expect(MOBILE_ESSENTIAL_IDS).toEqual([
      'undo',
      'redo',
      'styles',
      'bold',
      'italic',
      'underline',
      'bulletList',
      'orderedList',
      'link',
      'image',
      'comment',
    ])
  })

  it('has no duplicate ids', () => {
    expect(new Set(MOBILE_ESSENTIAL_IDS).size).toBe(MOBILE_ESSENTIAL_IDS.length)
  })

  it('has an accessible label for every essential id (and no extras)', () => {
    const labelKeys = Object.keys(MOBILE_ESSENTIAL_LABELS).sort()
    expect(labelKeys).toEqual([...MOBILE_ESSENTIAL_IDS].sort())
    for (const label of Object.values(MOBILE_ESSENTIAL_LABELS)) {
      expect(label.length).toBeGreaterThan(0)
    }
  })
})
