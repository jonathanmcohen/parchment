// @vitest-environment jsdom
// J10-3: structural (SSR) probe of the StatusBar's writing-goal chip + zen toggle.
// Mirrors the renderToStaticMarkup pattern (smtp-config-form / account-theme-select).

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatusBar } from '@/components/editor/StatusBar'

const baseProps = {
  pageCount: 1,
  full: { words: 50, chars: 300 },
  selection: null,
}

describe('StatusBar writing-goal chip', () => {
  it('shows "Set goal" when no target is set', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        ...baseProps,
        writingGoal: 0,
        onEditGoal: () => {},
      }),
    )
    expect(html).toContain('Set goal')
    expect(html).toContain('data-testid="writing-goal-chip"')
  })

  it('shows the percentage toward a target', () => {
    // 50 of 100 words → 50%
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        ...baseProps,
        writingGoal: 100,
        onEditGoal: () => {},
      }),
    )
    expect(html).toContain('50%')
  })

  it('marks the chip done when the goal is met', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        ...baseProps,
        full: { words: 120, chars: 700 },
        writingGoal: 100,
        onEditGoal: () => {},
      }),
    )
    expect(html).toContain('data-goal-done="true"')
    expect(html).toContain('100%')
  })

  it('omits the chip entirely when onEditGoal is not provided', () => {
    const html = renderToStaticMarkup(createElement(StatusBar, baseProps))
    expect(html).not.toContain('writing-goal-chip')
  })

  it('renders the zen toggle and reflects the pressed state', () => {
    const off = renderToStaticMarkup(
      createElement(StatusBar, { ...baseProps, zenMode: false, onToggleZen: () => {} }),
    )
    expect(off).toContain('data-testid="zen-toggle"')
    expect(off).toContain('aria-pressed="false"')
    expect(off).toContain('Enter focus mode')

    const on = renderToStaticMarkup(
      createElement(StatusBar, { ...baseProps, zenMode: true, onToggleZen: () => {} }),
    )
    expect(on).toContain('aria-pressed="true"')
    expect(on).toContain('Exit focus mode')
  })
})
