import { describe, expect, it } from 'vitest'
// The carry-forward gate is a zero-dep .mjs script with an exported pure parser
// (typed via JSDoc, so tsc resolves it without a declaration file).
import { parseScope } from '../../scripts/verify-carry-forward-closed.mjs'

// A small scope.md-shaped fixture: the legend / roll-up tables must be ignored,
// only `| <ID> | ... |` rows whose first cell is a plan id (A–L + digits) count.
const FIXTURE = `# Scope

## Status legend

| Code | Meaning |
|---|---|
| DONE | shipped |
| GAP | did not ship |

## Plan A

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| A1 | First thing | DONE | ✓ | ✓ | shipped + verified |
| A2 | Second thing | GAP | ✓ | ✓ | deferred to v0.2 — reason logged |
| A3 | Third thing | TODO | ☐ | ☐ | not started |

## Roll-up

| Plan | Items | DONE | GAP | Open |
|---|---|---|---|---|
| A | 3 | 1 | 1 | 1 |
`

describe('parseScope', () => {
  it('counts DONE / GAP / Open correctly and ignores non-item tables', () => {
    const report = parseScope(FIXTURE)
    expect(report.items.map((i: { id: string }) => i.id)).toEqual(['A1', 'A2', 'A3'])
    expect(report.counts).toEqual({ done: 1, gap: 1, open: 1, total: 3 })
    // The legend row "| DONE | shipped |" and the roll-up "| A | 3 | ... |"
    // are not item rows and must not be counted.
    expect(report.counts.total).toBe(3)
  })

  it('flags the Open item as an offender (a documented GAP is not an offender)', () => {
    const report = parseScope(FIXTURE)
    expect(report.offenders.map((o: { id: string }) => o.id)).toEqual(['A3'])
  })

  it('passes (no offenders) when every item is DONE', () => {
    // Flip the item-row statuses to DONE (the trailing notes disambiguate these
    // from the legend table's "| GAP | did not ship |" / "| DONE | shipped |").
    const allDone = FIXTURE.replace('| GAP | ✓', '| DONE | ✓').replace('| TODO | ☐', '| DONE | ☐')
    const report = parseScope(allDone)
    expect(report.counts).toEqual({ done: 3, gap: 0, open: 0, total: 3 })
    expect(report.offenders).toHaveLength(0)
  })

  it('treats a GAP with no note as an offender', () => {
    const gapNoNote = `## Plan B

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| B1 | Undocumented gap | GAP | ☐ | ☐ |  |
`
    const report = parseScope(gapNoNote)
    expect(report.offenders.map((o: { id: string }) => o.id)).toEqual(['B1'])
  })
})
