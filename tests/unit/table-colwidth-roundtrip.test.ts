// @vitest-environment node
//
// v0.2.10 table UX — colwidth persistence through the markdown mirror.
//
// Column widths (set by the resizable Table extension) are stored as a ProseMirror
// cell attribute `colwidth: number[]`. Parchment serializes a table to a
// `parchment:table` fence carrying the FULL node JSON (type + attrs + content),
// so every cell attr — including colwidth, colspan, rowspan and the `formula`
// attr — round-trips losslessly through the disk-mirror markdown. This suite pins
// that guarantee so a future serializer change can't silently drop widths.

import { describe, expect, it } from 'vitest'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
}

function find(node: Node | undefined, type: string): Node | undefined {
  if (!node) return undefined
  if (node.type === type) return node
  for (const child of node.content ?? []) {
    const hit = find(child, type)
    if (hit) return hit
  }
  return undefined
}

/** Collect every colwidth attr in document order. */
function colwidths(node: Node | undefined): unknown[] {
  const out: unknown[] = []
  const walk = (n: Node | undefined) => {
    if (!n) return
    if ((n.type === 'tableCell' || n.type === 'tableHeader') && 'colwidth' in (n.attrs ?? {})) {
      out.push(n.attrs?.colwidth)
    }
    for (const c of n.content ?? []) walk(c)
  }
  walk(node)
  return out
}

const cell = (text: string, colwidth: number[] | null): Node => ({
  type: 'tableCell',
  attrs: { colspan: 1, rowspan: 1, colwidth },
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

const tableDoc = (): Node => ({
  type: 'doc',
  content: [
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [cell('a', [180]), cell('b', [90]), cell('c', null)],
        },
        {
          type: 'tableRow',
          content: [cell('1', [180]), cell('2', [90]), cell('3', null)],
        },
      ],
    },
  ],
})

describe('table colwidth round-trip through the markdown mirror', () => {
  it('serializes to a parchment:table fence', () => {
    const md = serializeMarkdown(tableDoc())
    expect(md).toContain('parchment:table')
    // The width value must be present verbatim in the serialized JSON body.
    expect(md).toContain('180')
    expect(md).toContain('90')
  })

  it('round-trips: colwidths survive serialize → parse unchanged', () => {
    const md = serializeMarkdown(tableDoc())
    const parsed = markdownToJson(md) as Node
    const table = find(parsed, 'table')
    expect(table, 'parsed table node').toBeTruthy()

    const widths = colwidths(table)
    // Six cells (3 cols × 2 rows) — widths preserved per cell, nulls intact.
    expect(widths).toEqual([[180], [90], null, [180], [90], null])
  })

  it('preserves colspan/rowspan alongside colwidth', () => {
    const md = serializeMarkdown(tableDoc())
    const parsed = markdownToJson(md) as Node
    const firstCell = find(parsed, 'tableCell')
    expect(firstCell?.attrs?.colspan).toBe(1)
    expect(firstCell?.attrs?.rowspan).toBe(1)
    expect(firstCell?.attrs?.colwidth).toEqual([180])
  })
})
