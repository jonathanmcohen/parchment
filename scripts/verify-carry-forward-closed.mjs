#!/usr/bin/env node
// Carry-forward gate (L2): parse scope.md and fail if any tracked item is still
// Open (not DONE, and not GAP-with-a-note). Mirrors the Cairn "carry-forward
// closed" methodology — a release must not ship with silently-Open items.
//
// Zero dependencies (pure node). The parser is exported so the unit test
// (tests/unit/carry-forward.test.ts) can exercise it against a small fixture.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @typedef {Object} ScopeItem
 * @property {string} id      Item id, e.g. "L2".
 * @property {string} title   Item title (first cell after the id).
 * @property {string} status  Raw status cell, e.g. "DONE" | "GAP" | "TODO".
 * @property {string} notes   Trailing notes cell (may be empty).
 */

/**
 * @typedef {Object} ScopeReport
 * @property {ScopeItem[]} items      Every parsed item row.
 * @property {ScopeItem[]} offenders  Items that are not closed (block release).
 * @property {Record<string, number>} counts  Tallies: done/gap/open/total.
 * @property {Record<string, { done: number, gap: number, open: number, total: number }>} byPlan
 */

// An item row looks like: `| L2 | title | STATUS | cov | fm | notes |`.
// The id cell is a single plan letter (A–L) followed by digits — this excludes
// the legend / gate-column / roll-up tables, whose first cells are never ids.
const ID_RE = /^[A-L]\d+$/

/** Split a markdown table row into trimmed cells (drops the leading/trailing |). */
function splitRow(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return null
  const cells = trimmed.split('|').map((c) => c.trim())
  // Leading and trailing pipes produce empty first/last entries; drop them.
  if (cells.length >= 2 && cells[0] === '') cells.shift()
  if (cells.length >= 1 && cells[cells.length - 1] === '') cells.pop()
  return cells
}

/**
 * Classify a status cell.
 * @returns {"done" | "gap" | "open"}
 */
function classify(status) {
  const s = status.toUpperCase()
  if (s === 'DONE') return 'done'
  if (s === 'GAP') return 'gap'
  return 'open'
}

/**
 * Parse scope.md content into a structured carry-forward report.
 * @param {string} content
 * @returns {ScopeReport}
 */
export function parseScope(content) {
  /** @type {ScopeItem[]} */
  const items = []
  for (const line of content.split('\n')) {
    const cells = splitRow(line)
    if (!cells || cells.length < 3) continue
    const id = cells[0]
    if (!ID_RE.test(id)) continue
    items.push({
      id,
      title: cells[1] ?? '',
      status: cells[2] ?? '',
      notes: cells[cells.length - 1] ?? '',
    })
  }

  /** @type {ScopeItem[]} */
  const offenders = []
  const counts = { done: 0, gap: 0, open: 0, total: items.length }
  /** @type {ScopeReport["byPlan"]} */
  const byPlan = {}

  for (const item of items) {
    const plan = item.id[0]
    byPlan[plan] ??= { done: 0, gap: 0, open: 0, total: 0 }
    byPlan[plan].total += 1
    const kind = classify(item.status)
    counts[kind] += 1
    byPlan[plan][kind] += 1
    // A GAP is only acceptable when it carries a documented note.
    if (kind === 'open' || (kind === 'gap' && item.notes.length === 0)) {
      offenders.push(item)
    }
  }

  return { items, offenders, counts, byPlan }
}

/** Render a human-readable summary of a report. */
export function formatReport(report) {
  const lines = []
  lines.push('Carry-forward closed — scope.md audit')
  lines.push('')
  lines.push('Plan  done  gap  open  total')
  for (const plan of Object.keys(report.byPlan).sort()) {
    const p = report.byPlan[plan]
    lines.push(
      `  ${plan}   ${String(p.done).padStart(4)} ${String(p.gap).padStart(4)} ${String(
        p.open,
      ).padStart(4)} ${String(p.total).padStart(5)}`,
    )
  }
  lines.push('')
  const c = report.counts
  lines.push(`Total: ${c.total}  (done ${c.done}, gap ${c.gap}, open ${c.open})`)
  if (report.offenders.length > 0) {
    lines.push('')
    lines.push(`OFFENDERS (${report.offenders.length}) — block release:`)
    for (const o of report.offenders) {
      const why = o.status.toUpperCase() === 'GAP' ? 'GAP without a documented note' : o.status
      lines.push(`  ${o.id}: ${why}`)
    }
  }
  return lines.join('\n')
}

// --- CLI entrypoint (run directly, not when imported by the test) ---
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url))
  const scopePath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : resolve(here, '..', 'scope.md')
  let content
  try {
    content = readFileSync(scopePath, 'utf8')
  } catch (err) {
    console.error(`verify-carry-forward-closed: cannot read ${scopePath}: ${err.message}`)
    process.exit(2)
  }
  const report = parseScope(content)
  console.log(formatReport(report))
  if (report.offenders.length > 0) {
    console.error(
      `\nverify-carry-forward-closed: FAIL — ${report.offenders.length} item(s) not closed.`,
    )
    process.exit(1)
  }
  console.log('\nverify-carry-forward-closed: PASS — all items DONE or documented GAP.')
}
