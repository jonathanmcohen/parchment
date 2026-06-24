import { describe, expect, it } from 'vitest'
import { partitionControls } from '@/lib/editor/toolbar-overflow'

// S3-3: the toolbar overflow partition is pure layout logic. Given an ordered
// list of control widths and an available width, every control id must land in
// EXACTLY one bucket (inline or overflow), and the overflow bucket must equal
// the set of controls that do not fit — never dropped, never duplicated
// (the "toolbar overflow breakage" failure mode).

const controls = [
  { id: 'undo', width: 32 },
  { id: 'redo', width: 32 },
  { id: 'print', width: 32 },
  { id: 'bold', width: 32 },
  { id: 'italic', width: 32 },
  { id: 'underline', width: 32 },
]

describe('partitionControls', () => {
  it('keeps everything inline when the row is wide enough', () => {
    const { inline, overflow } = partitionControls(controls, 10_000, 40)
    expect(inline.map((c) => c.id)).toEqual(['undo', 'redo', 'print', 'bold', 'italic', 'underline'])
    expect(overflow).toEqual([])
  })

  it('pushes the trailing controls that do not fit into overflow, in order', () => {
    // Reserve 40px for the ⋯ button. Room for ~3 controls (96px) + ⋯.
    const { inline, overflow } = partitionControls(controls, 96 + 40, 40)
    expect(inline.map((c) => c.id)).toEqual(['undo', 'redo', 'print'])
    expect(overflow.map((c) => c.id)).toEqual(['bold', 'italic', 'underline'])
  })

  it('every control lands in exactly one bucket at three widths', () => {
    for (const avail of [40, 200, 10_000]) {
      const { inline, overflow } = partitionControls(controls, avail, 40)
      const ids = [...inline, ...overflow].map((c) => c.id).sort()
      expect(ids).toEqual(['bold', 'italic', 'print', 'redo', 'underline', 'undo'])
      // no id appears twice
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('does not reserve overflow space when nothing overflows (last control fits exactly)', () => {
    // Exactly enough for all 6 controls (192px); no ⋯ needed → no reserve.
    const { inline, overflow } = partitionControls(controls, 192, 40)
    expect(overflow).toEqual([])
    expect(inline).toHaveLength(6)
  })

  it('treats a non-positive width as everything overflowing', () => {
    const { inline, overflow } = partitionControls(controls, 0, 40)
    expect(inline).toEqual([])
    expect(overflow.map((c) => c.id)).toEqual(['undo', 'redo', 'print', 'bold', 'italic', 'underline'])
  })
})
