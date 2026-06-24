import { describe, expect, it } from 'vitest'
import { buildStarRequest } from '@/lib/docs/star-request'

// C4: the title-bar Star icon must persist via the EXISTING star endpoint
// `POST /api/docs/:id/star` with `{ starred }` — the same endpoint FileManager
// uses — so a star survives reload. It must NEVER be a local-only toggle. This
// pure descriptor lets the unit gate prove the request shape (route + body)
// without a network round-trip, mirroring buildRenameRequest (S3-1).

describe('buildStarRequest', () => {
  it('targets the existing /star endpoint with POST', () => {
    const req = buildStarRequest('abc-123', true)
    expect(req.url).toBe('/api/docs/abc-123/star')
    expect(req.method).toBe('POST')
  })

  it('sends the next starred state as a boolean', () => {
    expect(buildStarRequest('d1', true).body).toEqual({ starred: true })
    expect(buildStarRequest('d1', false).body).toEqual({ starred: false })
  })

  it('reuses the same route shape FileManager uses (no new backend)', () => {
    const docId = 'doc-xyz'
    expect(buildStarRequest(docId, true).url).toBe(`/api/docs/${docId}/star`)
  })

  it('coerces a truthy/falsy next value to a real boolean', () => {
    // The caller flips a boolean, but guard the body is always a true boolean.
    const on = buildStarRequest('d1', true)
    const off = buildStarRequest('d1', false)
    expect(typeof on.body.starred).toBe('boolean')
    expect(typeof off.body.starred).toBe('boolean')
  })
})
