// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectReaders, presenceCluster, throttle } from '@/lib/editor/reading-presence'

describe('collectReaders', () => {
  const NOW = 1_000_000

  function makeState(
    clientId: number,
    opts: {
      name?: string
      color?: string
      pos?: number
      updatedAt?: number | null
      noUser?: boolean
      noReading?: boolean
    } = {},
  ): [number, Record<string, unknown>] {
    const state: Record<string, unknown> = {}
    if (!opts.noUser) {
      state.user = {
        name: opts.name ?? 'Alice',
        ...(opts.color !== undefined ? { color: opts.color } : {}),
      }
    }
    if (!opts.noReading) {
      const reading: Record<string, unknown> = { pos: opts.pos ?? 10 }
      if (opts.updatedAt !== undefined) {
        reading.updatedAt = opts.updatedAt
      }
      state.reading = reading
    }
    return [clientId, state]
  }

  it('excludes the self client id', () => {
    const states = new Map([makeState(1), makeState(2)])
    const result = collectReaders(states, 1, NOW)
    expect(result).toHaveLength(1)
    expect(result[0]?.clientId).toBe(2)
  })

  it('includes a valid remote reader', () => {
    const states = new Map([makeState(2, { name: 'Bob', color: '#ff0000', pos: 5 })])
    const result = collectReaders(states, 1, NOW)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      clientId: 2,
      user: { name: 'Bob', color: '#ff0000' },
      pos: 5,
    })
  })

  it('sorts by pos ascending, then by clientId for stability', () => {
    const states = new Map([
      makeState(3, { pos: 20 }),
      makeState(2, { pos: 5 }),
      makeState(4, { pos: 20 }),
    ])
    const result = collectReaders(states, 1, NOW)
    expect(result.map((r) => r.clientId)).toEqual([2, 3, 4])
  })

  it('drops entries missing user.name', () => {
    const states = new Map<number, Record<string, unknown>>([
      [2, { user: { name: '' }, reading: { pos: 10 } }],
      [3, { reading: { pos: 10 } }],
      [4, { user: 'string-not-object', reading: { pos: 10 } }],
    ])
    const result = collectReaders(states, 1, NOW)
    expect(result).toHaveLength(0)
  })

  it('drops entries missing reading.pos', () => {
    const states = new Map<number, Record<string, unknown>>([
      [2, { user: { name: 'Alice' }, reading: { pos: 'not-a-number' } }],
      [3, { user: { name: 'Bob' } }],
      [4, { user: { name: 'Carol' }, reading: { pos: Infinity } }],
    ])
    const result = collectReaders(states, 1, NOW)
    expect(result).toHaveLength(0)
  })

  it('drops stale entries (updatedAt older than staleMs)', () => {
    const STALE_MS = 30_000
    const states = new Map([
      makeState(2, { updatedAt: NOW - STALE_MS - 1 }), // just stale
      makeState(3, { updatedAt: NOW - STALE_MS }), // exactly at boundary → fresh (<=)
    ])
    const result = collectReaders(states, 1, NOW, STALE_MS)
    expect(result).toHaveLength(1)
    expect(result[0]?.clientId).toBe(3)
  })

  it('keeps entries with no updatedAt (treat as fresh)', () => {
    // Pass no updatedAt option so the reading object has no updatedAt field
    const states = new Map([makeState(2, {})])
    const result = collectReaders(states, 1, NOW)
    expect(result).toHaveLength(1)
  })

  it('defaults missing color to #888888', () => {
    const states = new Map<number, Record<string, unknown>>([
      [2, { user: { name: 'Alice' }, reading: { pos: 10 } }],
    ])
    const result = collectReaders(states, 1, NOW)
    expect(result[0]?.user.color).toBe('#888888')
  })

  // Task 14 — a remote with reading.pos but NO user.name is excluded.
  it('drops an entry with reading.pos but no user.name', () => {
    const states = new Map<number, Record<string, unknown>>([
      [2, { reading: { pos: 10 } }], // no user at all
      [3, { user: { color: '#111' }, reading: { pos: 20 } }], // user without name
    ])
    const result = collectReaders(states, 1, NOW)
    expect(result).toHaveLength(0)
  })

  it('over a 3-state map (self + 2 remotes, one stale) returns exactly the 1 fresh remote', () => {
    const STALE = 30_000
    const states = new Map([
      makeState(1, { name: 'Self', pos: 5, updatedAt: NOW }), // self
      makeState(2, { name: 'Fresh', pos: 8, updatedAt: NOW - 1000 }),
      makeState(3, { name: 'Stale', pos: 12, updatedAt: NOW - STALE - 1 }),
    ])
    const result = collectReaders(states, 1, NOW, STALE)
    expect(result).toHaveLength(1)
    expect(result[0]?.user.name).toBe('Fresh')
  })
})

describe('presenceCluster (Task 14)', () => {
  const NOW = 1_000_000

  it('de-duplicates participants and excludes self', () => {
    const states = new Map<number, Record<string, unknown>>([
      [1, { user: { name: 'Self', color: '#000' } }], // self
      [2, { user: { name: 'Alice', color: '#1a73e8' }, cursor: { anchor: 1, head: 2 } }],
      [3, { user: { name: 'Bob', color: '#15803d' }, reading: { pos: 4, updatedAt: NOW } }],
    ])
    const cluster = presenceCluster(states, 1, NOW)
    expect(cluster.map((c) => c.name).sort()).toEqual(['Alice', 'Bob'])
    expect(cluster.find((c) => c.name === 'Self')).toBeUndefined()
  })

  it('marks a participant with a recent caret/selection as editing, reading-only as viewing', () => {
    const states = new Map<number, Record<string, unknown>>([
      [2, { user: { name: 'Editor', color: '#1a73e8' }, cursor: { anchor: 1, head: 3 } }],
      [3, { user: { name: 'Viewer', color: '#15803d' }, reading: { pos: 4, updatedAt: NOW } }],
    ])
    const cluster = presenceCluster(states, 1, NOW)
    expect(cluster.find((c) => c.name === 'Editor')?.editing).toBe(true)
    expect(cluster.find((c) => c.name === 'Viewer')?.editing).toBe(false)
  })

  it('includes a participant that has a user but neither cursor nor reading (present, viewing)', () => {
    const states = new Map<number, Record<string, unknown>>([
      [2, { user: { name: 'Lurker', color: '#1a73e8' } }],
    ])
    const cluster = presenceCluster(states, 1, NOW)
    expect(cluster).toHaveLength(1)
    expect(cluster[0]?.editing).toBe(false)
  })

  it('excludes a participant with no user name', () => {
    const states = new Map<number, Record<string, unknown>>([
      [2, { cursor: { anchor: 1, head: 2 } }], // no user
      [3, { user: { color: '#111' }, cursor: { anchor: 1, head: 2 } }], // no name
    ])
    expect(presenceCluster(states, 1, NOW)).toHaveLength(0)
  })

  it('two distinct user ids map to two distinct palette colours via authorColor', () => {
    // colour-distinctness is a property of authorColor; pin that two different ids
    // generally differ (the 12-colour palette + djb2 hash). Use ids known to differ.
    const states = new Map<number, Record<string, unknown>>([
      [2, { user: { name: 'A', color: '#1a73e8' } }],
      [3, { user: { name: 'B', color: '#15803d' } }],
    ])
    const cluster = presenceCluster(states, 1, NOW)
    const colors = new Set(cluster.map((c) => c.color))
    expect(colors.size).toBe(2)
  })
})

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires immediately on the leading edge', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 200)
    throttled('a')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('a burst within the window yields exactly one trailing call with the LATEST args', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 200)
    throttled('first') // leading: fires immediately
    throttled('second') // within window
    throttled('third') // within window — latest
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(200)
    // Trailing call fires with 'third'
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('third')
  })

  it('.cancel() prevents the trailing call', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 200)
    throttled('first') // leading fires
    throttled('second') // pending trailing
    throttled.cancel()
    vi.advanceTimersByTime(500)
    // Only the leading call, trailing was cancelled
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
