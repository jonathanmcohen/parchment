// J11-3: pure days-until-purge math for the trash list. No db / no React.

import { describe, expect, it } from 'vitest'
import { daysUntilPurge, describePurge } from '@/lib/docs/trash'

const DAY = 24 * 60 * 60 * 1000

describe('daysUntilPurge', () => {
  it('returns null when retention is 0 (keep forever)', () => {
    expect(daysUntilPurge('2026-06-01T00:00:00Z', 0, Date.parse('2026-06-10T00:00:00Z'))).toBeNull()
  })

  it('returns null for a missing/invalid trashedAt', () => {
    expect(daysUntilPurge(null, 30, Date.now())).toBeNull()
    expect(daysUntilPurge('not-a-date', 30, Date.now())).toBeNull()
  })

  it('counts full days remaining until purge', () => {
    const trashed = '2026-06-01T00:00:00Z'
    // retention 30 days → purge at 2026-07-01; now = 2026-06-21 → 10 days left
    const now = Date.parse('2026-06-21T00:00:00Z')
    expect(daysUntilPurge(trashed, 30, now)).toBe(10)
  })

  it('clamps to 0 once the purge moment has passed', () => {
    const trashed = '2026-06-01T00:00:00Z'
    const now = Date.parse('2026-08-01T00:00:00Z') // well past 30-day window
    expect(daysUntilPurge(trashed, 30, now)).toBe(0)
  })

  it('rounds up a partial day so "today" reads as 1, not 0', () => {
    const trashed = '2026-06-01T00:00:00Z'
    const now = Date.parse('2026-06-01T00:00:00Z') + 30 * DAY - DAY / 2 // 12h before purge
    expect(daysUntilPurge(trashed, 30, now)).toBe(1)
  })
})

describe('describePurge', () => {
  it('says "kept forever" when retention is 0', () => {
    expect(describePurge(null)).toMatch(/forever/i)
  })

  it('renders a day countdown', () => {
    expect(describePurge(10)).toMatch(/10 days/i)
    expect(describePurge(1)).toMatch(/1 day\b/i)
  })

  it('renders "soon" / today wording at 0', () => {
    expect(describePurge(0)).toMatch(/soon|today/i)
  })
})
