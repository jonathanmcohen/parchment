import { describe, expect, it } from 'vitest'
import {
  EDITOR_CHROME_STACK_PX,
  sidePanelStyle,
} from '@/components/editor/side-panel-style'

// v0.2.7 #6: the editor right-rail panels (Version history / Comments) must be a
// sticky side panel on desktop so they are reachable from ANY scroll position on a
// long doc; non-sticky on mobile so a narrow viewport is never covered.

describe('sidePanelStyle', () => {
  it('defaults to a sticky panel pinned below the chrome stack', () => {
    const s = sidePanelStyle({ width: 300 })
    expect(s.position).toBe('sticky')
    expect(s.top).toBe(EDITOR_CHROME_STACK_PX)
    expect(s.alignSelf).toBe('flex-start')
    // maxHeight caps the panel to the remaining viewport so its list scrolls inside.
    expect(s.maxHeight).toBe(`calc(100vh - ${EDITOR_CHROME_STACK_PX}px)`)
    expect(s.overflowY).toBe('auto')
    expect(s.width).toBe(300)
  })

  it('honours a custom width and chrome offset', () => {
    const s = sidePanelStyle({ width: 280, chromePx: 100 })
    expect(s.width).toBe(280)
    expect(s.top).toBe(100)
    expect(s.maxHeight).toBe('calc(100vh - 100px)')
  })

  it('drops sticky + maxHeight on mobile (sticky:false) so the panel never covers the doc', () => {
    const s = sidePanelStyle({ width: 300, sticky: false })
    expect(s.position).toBeUndefined()
    expect(s.top).toBeUndefined()
    expect(s.maxHeight).toBeUndefined()
    expect(s.alignSelf).toBeUndefined()
    // Still a real flex column rail with the shared chrome.
    expect(s.display).toBe('flex')
    expect(s.flexDirection).toBe('column')
    expect(s.overflowY).toBe('auto')
    expect(s.width).toBe(300)
  })

  it('the chrome-stack constant matches the title+menu+toolbar heights (56+32+48)', () => {
    expect(EDITOR_CHROME_STACK_PX).toBe(56 + 32 + 48)
  })
})
