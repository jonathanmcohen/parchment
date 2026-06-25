import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.1.5: normalization tests for getPageLayoutMode / setPageLayoutMode.
// settings-repo reaches the DB via getSetting/setSetting (drizzle), so we mock
// @/db to feed a stored value into getSetting and to capture what setSetting
// upserts — no Postgres needed. We assert the validation rule: only the exact
// literal 'paged' is honoured; everything else falls back to 'continuous'.

const { selectLimit, insertValues } = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  insertValues: vi.fn(),
}))

vi.mock('@/db', () => ({
  schema: {
    settings: { ownerId: 'settings.ownerId', key: 'settings.key', value: 'settings.value' },
  },
  db: {
    // getSetting: db.select({...}).from(...).where(...).limit(1) → rows[]
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (...args: unknown[]) => selectLimit(...args),
        }),
      }),
    }),
    // setSetting: db.insert(...).values({...}).onConflictDoUpdate({...})
    insert: () => ({
      values: (v: unknown) => {
        insertValues(v)
        return { onConflictDoUpdate: () => Promise.resolve() }
      },
    }),
  },
}))

import { getPageLayoutMode, setPageLayoutMode } from '@/lib/docs/settings-repo'

beforeEach(() => {
  selectLimit.mockReset()
  insertValues.mockReset()
})

describe('v0.1.5 — getPageLayoutMode', () => {
  it("returns 'paged' only when the stored value is exactly 'paged'", async () => {
    selectLimit.mockResolvedValue([{ value: 'paged' }])
    expect(await getPageLayoutMode('owner-1')).toBe('paged')
  })

  it("returns 'continuous' when the stored value is exactly 'continuous'", async () => {
    selectLimit.mockResolvedValue([{ value: 'continuous' }])
    expect(await getPageLayoutMode('owner-1')).toBe('continuous')
  })

  it("returns 'continuous' when unset (no row)", async () => {
    selectLimit.mockResolvedValue([])
    expect(await getPageLayoutMode('owner-1')).toBe('continuous')
  })

  it("returns 'continuous' for any arbitrary / malformed stored value", async () => {
    for (const bogus of ['Paged', 'PAGED', ' paged ', 'pages', 42, null, {}, true]) {
      selectLimit.mockResolvedValue([{ value: bogus }])
      expect(await getPageLayoutMode('owner-1')).toBe('continuous')
    }
  })
})

describe('v0.1.5 — setPageLayoutMode', () => {
  it("persists and returns 'paged' when given 'paged'", async () => {
    const result = await setPageLayoutMode('owner-1', 'paged')
    expect(result).toBe('paged')
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ value: 'paged' }))
  })

  it("coerces any non-'paged' input to 'continuous'", async () => {
    for (const input of ['continuous', 'bogus', 'Paged', 42, null, undefined, {}]) {
      insertValues.mockClear()
      const result = await setPageLayoutMode('owner-1', input)
      expect(result).toBe('continuous')
      expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ value: 'continuous' }))
    }
  })
})
