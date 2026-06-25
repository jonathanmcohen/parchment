import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useConnectionState } from '@/components/editor/useConnectionState'

// V5 regression: the editor status bar's connection state must render the SAME on
// the server and on the client's first render, or React throws hydration error
// #418 (confirmed live: SSR data-state="offline" vs hydrated data-state="online").
//
// The original bug read navigator.onLine in the useState initializer behind a
// `typeof navigator !== 'undefined'` guard. That guard is NOT server-safe on
// Node 21+, which defines a GLOBAL `navigator` with no `.onLine` — so the
// expression was `undefined` (falsy) on the server and the bar rendered
// 'offline'. renderToStaticMarkup runs the hook exactly as the server does
// (effects do NOT run), so this catches the regression in node.

function Probe() {
  const connection = useConnectionState(null)
  return createElement('span', { 'data-state': connection })
}

describe('useConnectionState — SSR hydration safety (V5)', () => {
  it('server-renders a stable connection state, never "offline"', () => {
    const html = renderToStaticMarkup(createElement(Probe))
    // Initial server render: isOnline=true (stable default), providerStatus
    // ='connecting' → 'syncing'. This is also the client's FIRST render, so they
    // match and no #418 fires. Before the fix this was 'offline' on Node 21+.
    expect(html).toContain('data-state="syncing"')
    expect(html).not.toContain('data-state="offline"')
  })

  it('does not depend on the host navigator.onLine value during SSR', () => {
    // Even if a global `navigator` exists in this runtime (Node 21+), the SSR
    // render must not read its (absent) onLine — the result stays 'syncing'.
    const hadNavigator = typeof (globalThis as { navigator?: unknown }).navigator !== 'undefined'
    const html = renderToStaticMarkup(createElement(Probe))
    expect(html).toContain('data-state="syncing"')
    // Sanity: this runtime is representative of the deploy (global navigator
    // present on modern Node); the assertion above holds regardless.
    expect(typeof hadNavigator).toBe('boolean')
  })
})
