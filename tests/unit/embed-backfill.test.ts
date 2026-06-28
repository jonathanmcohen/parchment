import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// J4-2: the embedding backfill processes docs whose `embedding IS NULL` in
// batches, best-effort. It must:
//   - no-op (and never touch the db) when semantic is disabled
//   - embed ONLY null-embedding rows, persisting the vector
//   - never throw even if `embed` or a write fails
//   - report how many it filled
// The db + embed are injected so this is a pure unit test — NO live endpoint,
// NO real Postgres. (The real wiring is covered by the integration suite.)

const EMBEDDING_DIM = 768
const makeVector = (fill = 0.1) => Array.from({ length: EMBEDDING_DIM }, () => fill)

describe('backfillEmbeddings', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.EMBEDDINGS_URL
  })
  afterEach(() => {
    delete process.env.EMBEDDINGS_URL
  })

  it('no-ops and never reads rows when semantic is disabled', async () => {
    const { backfillEmbeddings } = await import('@/lib/search/backfill')
    const fetchBatch = vi.fn()
    const persist = vi.fn()
    const embed = vi.fn()
    const result = await backfillEmbeddings({
      isEnabled: () => false,
      fetchBatch,
      persist,
      embed,
    })
    expect(result).toEqual({ processed: 0, filled: 0, skipped: true })
    expect(fetchBatch).not.toHaveBeenCalled()
    expect(embed).not.toHaveBeenCalled()
  })

  it('embeds only the rows handed back and persists each vector', async () => {
    const { backfillEmbeddings } = await import('@/lib/search/backfill')
    const rows = [
      { id: 'a', title: 'A', markdown: 'alpha' },
      { id: 'b', title: 'B', markdown: 'beta' },
    ]
    // first call returns the batch, second returns empty (done)
    const fetchBatch = vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([])
    const persist = vi.fn().mockResolvedValue(undefined)
    const embed = vi.fn().mockResolvedValue(makeVector())

    const result = await backfillEmbeddings({
      isEnabled: () => true,
      fetchBatch,
      persist,
      embed,
      batchSize: 100,
    })

    expect(result.skipped).toBe(false)
    expect(result.processed).toBe(2)
    expect(result.filled).toBe(2)
    expect(embed).toHaveBeenCalledTimes(2)
    expect(persist).toHaveBeenCalledWith('a', makeVector())
    expect(persist).toHaveBeenCalledWith('b', makeVector())
  })

  it('skips a row whose embed returns null without throwing', async () => {
    const { backfillEmbeddings } = await import('@/lib/search/backfill')
    const rows = [
      { id: 'a', title: 'A', markdown: 'alpha' },
      { id: 'b', title: 'B', markdown: 'beta' },
    ]
    const fetchBatch = vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([])
    const persist = vi.fn().mockResolvedValue(undefined)
    const embed = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(makeVector())

    const result = await backfillEmbeddings({
      isEnabled: () => true,
      fetchBatch,
      persist,
      embed,
    })

    expect(result.processed).toBe(2)
    expect(result.filled).toBe(1)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith('b', makeVector())
  })

  it('never throws when embed rejects mid-batch (best-effort)', async () => {
    const { backfillEmbeddings } = await import('@/lib/search/backfill')
    const rows = [
      { id: 'a', title: 'A', markdown: 'alpha' },
      { id: 'b', title: 'B', markdown: 'beta' },
    ]
    const fetchBatch = vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([])
    const persist = vi.fn().mockResolvedValue(undefined)
    const embed = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(makeVector())

    const result = await backfillEmbeddings({
      isEnabled: () => true,
      fetchBatch,
      persist,
      embed,
    })

    expect(result.filled).toBe(1)
    expect(result.processed).toBe(2)
  })

  it('stops after maxDocs even if more rows remain', async () => {
    const { backfillEmbeddings } = await import('@/lib/search/backfill')
    const batch = [
      { id: 'a', title: 'A', markdown: 'a' },
      { id: 'b', title: 'B', markdown: 'b' },
    ]
    // fetchBatch would keep returning rows forever; maxDocs must bound it.
    const fetchBatch = vi.fn().mockResolvedValue(batch)
    const persist = vi.fn().mockResolvedValue(undefined)
    const embed = vi.fn().mockResolvedValue(makeVector())

    const result = await backfillEmbeddings({
      isEnabled: () => true,
      fetchBatch,
      persist,
      embed,
      batchSize: 2,
      maxDocs: 2,
    })

    expect(result.processed).toBe(2)
    // only one batch fetched (we hit the cap)
    expect(fetchBatch).toHaveBeenCalledTimes(1)
  })

  it('terminates when fetchBatch returns an empty page', async () => {
    const { backfillEmbeddings } = await import('@/lib/search/backfill')
    const fetchBatch = vi.fn().mockResolvedValue([])
    const result = await backfillEmbeddings({
      isEnabled: () => true,
      fetchBatch,
      persist: vi.fn(),
      embed: vi.fn(),
    })
    expect(result.processed).toBe(0)
    expect(result.filled).toBe(0)
  })
})
