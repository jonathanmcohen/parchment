import { describe, expect, it } from 'vitest'
import { schema } from '@/db'
import { parseMentions } from '@/lib/docs/comments-shared'

// H Task 2 — assert the durable anchor columns exist on the comments table and
// are jsonb-typed, and that the pure parseMentions re-export still resolves.

describe('comments.anchorStart / anchorEnd durable anchor columns', () => {
  it('exposes anchorStart as a jsonb column mapped to anchor_start', () => {
    const col = schema.comments.anchorStart
    expect(col).toBeDefined()
    expect(col.name).toBe('anchor_start')
    expect(col.dataType).toBe('json')
  })

  it('exposes anchorEnd as a jsonb column mapped to anchor_end', () => {
    const col = schema.comments.anchorEnd
    expect(col).toBeDefined()
    expect(col.name).toBe('anchor_end')
    expect(col.dataType).toBe('json')
  })

  it('keeps the integer fallback columns', () => {
    expect(schema.comments.anchorFrom).toBeDefined()
    expect(schema.comments.anchorTo).toBeDefined()
  })

  it('still re-exports a working parseMentions', () => {
    expect(parseMentions('hi @alice and @bob')).toEqual(['alice', 'bob'])
  })
})
