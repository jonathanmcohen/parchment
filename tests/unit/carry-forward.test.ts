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

  // Regression: scope.md item ids may carry a lowercase suffix (e.g. `F2b`, a
  // user-approved add). An unsuffixed matcher silently DROPS such rows, so an
  // Open suffixed item could slip past the gate entirely — the exact gate hole.
  it('counts a suffixed item id (e.g. F2b) and does not drop it', () => {
    const suffixed = `## Plan F

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| F2 | Watcher | DONE | ✓ | ✓ | shipped |
| F2b | Live bridge | DONE | ✓ | ✓ | shipped + verified |
`
    const report = parseScope(suffixed)
    expect(report.items.map((i: { id: string }) => i.id)).toEqual(['F2', 'F2b'])
    expect(report.counts).toEqual({ done: 2, gap: 0, open: 0, total: 2 })
    expect(report.byPlan.F).toEqual({ done: 2, gap: 0, open: 0, total: 2 })
  })

  it('flags an Open suffixed item as an offender (the gate-hole exploit)', () => {
    // Before the fix, `| F2b | ... | TODO | ... |` was invisible to the scan:
    // items=['F2'], offenders=[], open=0 — the gate would pass GREEN despite an
    // Open suffixed item. The fix must surface F2b as an offender.
    const openSuffixed = `## Plan F

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| F2 | Watcher | DONE | ✓ | ✓ | shipped |
| F2b | Live bridge | TODO | ☐ | ☐ | not started |
`
    const report = parseScope(openSuffixed)
    expect(report.items.map((i: { id: string }) => i.id)).toEqual(['F2', 'F2b'])
    expect(report.counts.open).toBe(1)
    expect(report.offenders.map((o: { id: string }) => o.id)).toEqual(['F2b'])
  })
})
