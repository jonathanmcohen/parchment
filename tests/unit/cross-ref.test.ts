// @vitest-environment node
//
// G8a: pure cross-reference target collection. collectCrossRefTargets walks a
// ProseMirror doc (plain JSON here — no editor graph) and assigns per-kind
// sequential numbers in document order. indexTargets builds an O(1) lookup map.

import { describe, expect, it } from 'vitest'
import { collectCrossRefTargets, indexTargets } from '@/lib/editor/cross-ref'
import type { CrossRefTarget } from '@/lib/editor/cross-ref'

// ── Doc-builder helpers ────────────────────────────────────────────────────

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const text = (t: string) => ({ type: 'text', text: t })

const fig = (refId: string, caption = '') => ({
  type: 'image',
  attrs: { src: 'x.png', alt: 'alt', refId, caption },
})
const tbl = (refId: string, caption = '') => ({
  type: 'table',
  attrs: { refId, caption },
  content: [
    { type: 'tableRow', content: [{ type: 'tableCell', content: [p(text('x'))] }] },
  ],
})
const eq = (refId: string, latex = 'x') => ({
  type: 'mathBlock',
  attrs: { latex, refId },
})
const heading = (id: string, level = 1, label = 'Hello') => ({
  type: 'heading',
  attrs: { level, id },
  content: [text(label)],
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('G8a — collectCrossRefTargets', () => {
  it('numbers 2 figures, 1 table, 1 equation, 2 headings in document order', () => {
    const d = doc(
      heading('sec-1', 1, 'Intro'),
      fig('fig-aaa', 'First figure'),
      p(text('some text')),
      tbl('tbl-bbb', 'My table'),
      eq('eq-ccc', 'E=mc^2'),
      fig('fig-ddd', 'Second figure'),
      heading('sec-2', 2, 'Methods'),
    )
    const targets = collectCrossRefTargets(d)

    const figures = targets.filter((t) => t.kind === 'figure')
    const tables = targets.filter((t) => t.kind === 'table')
    const equations = targets.filter((t) => t.kind === 'equation')
    const sections = targets.filter((t) => t.kind === 'heading')

    expect(figures).toHaveLength(2)
    expect(tables).toHaveLength(1)
    expect(equations).toHaveLength(1)
    expect(sections).toHaveLength(2)

    expect(figures[0]?.number).toBe(1)
    expect(figures[1]?.number).toBe(2)
    expect(tables[0]?.number).toBe(1)
    expect(equations[0]?.number).toBe(1)
    expect(sections[0]?.number).toBe(1)
    expect(sections[1]?.number).toBe(2)
  })

  it('preserves the stable refId of each target (not derived from number)', () => {
    const d = doc(fig('fig-stable-1'), fig('fig-stable-2'))
    const targets = collectCrossRefTargets(d)
    expect(targets[0]?.refId).toBe('fig-stable-1')
    expect(targets[1]?.refId).toBe('fig-stable-2')
  })

  it('reordering figures swaps their numbers but preserves their refIds', () => {
    const ordered = doc(fig('fig-a'), fig('fig-b'))
    const swapped = doc(fig('fig-b'), fig('fig-a'))

    const ordTargets = collectCrossRefTargets(ordered)
    const swpTargets = collectCrossRefTargets(swapped)

    // Original order: fig-a=1, fig-b=2
    expect(ordTargets.find((t) => t.refId === 'fig-a')?.number).toBe(1)
    expect(ordTargets.find((t) => t.refId === 'fig-b')?.number).toBe(2)

    // Swapped: fig-b=1, fig-a=2
    expect(swpTargets.find((t) => t.refId === 'fig-b')?.number).toBe(1)
    expect(swpTargets.find((t) => t.refId === 'fig-a')?.number).toBe(2)
  })

  it('produces correct labels: "Figure N", "Table N", "Equation (N)", "Section N"', () => {
    const d = doc(fig('f1'), tbl('t1'), eq('e1'), heading('h1'))
    const targets = collectCrossRefTargets(d)

    expect(targets.find((t) => t.kind === 'figure')?.label).toBe('Figure 1')
    expect(targets.find((t) => t.kind === 'table')?.label).toBe('Table 1')
    expect(targets.find((t) => t.kind === 'equation')?.label).toBe('Equation (1)')
    expect(targets.find((t) => t.kind === 'heading')?.label).toBe('Section 1')
  })

  it('carries caption through to the target for figures and tables', () => {
    const d = doc(fig('f1', 'My amazing figure'), tbl('t1', 'Summary table'))
    const targets = collectCrossRefTargets(d)
    expect(targets.find((t) => t.kind === 'figure')?.caption).toBe('My amazing figure')
    expect(targets.find((t) => t.kind === 'table')?.caption).toBe('Summary table')
  })

  it('skips nodes with no refId (figures/tables/equations without one)', () => {
    const d = doc(
      { type: 'image', attrs: { src: 'x.png', alt: 'no ref', refId: '', caption: '' } },
      { type: 'mathBlock', attrs: { latex: 'x', refId: '' } },
    )
    const targets = collectCrossRefTargets(d)
    expect(targets).toHaveLength(0)
  })

  it('headings use their `id` attr as refId', () => {
    const d = doc(heading('intro', 1, 'Intro'))
    const targets = collectCrossRefTargets(d)
    expect(targets[0]?.refId).toBe('intro')
    expect(targets[0]?.kind).toBe('heading')
  })

  it('returns an empty array for a doc with no refId-bearing nodes', () => {
    const d = doc(p(text('nothing here')))
    expect(collectCrossRefTargets(d)).toHaveLength(0)
  })
})

describe('G8a — indexTargets', () => {
  it('maps each refId to its CrossRefTarget', () => {
    const targets: CrossRefTarget[] = [
      { refId: 'f1', kind: 'figure', number: 1, label: 'Figure 1' },
      { refId: 't1', kind: 'table', number: 1, label: 'Table 1' },
    ]
    const map = indexTargets(targets)
    expect(map.get('f1')).toEqual(targets[0])
    expect(map.get('t1')).toEqual(targets[1])
  })

  it('has the same size as the targets array', () => {
    const d = doc(fig('a'), fig('b'), tbl('c'))
    const targets = collectCrossRefTargets(d)
    const map = indexTargets(targets)
    expect(map.size).toBe(targets.length)
  })

  it('returns an empty map for zero targets', () => {
    expect(indexTargets([])).toEqual(new Map())
  })
})
