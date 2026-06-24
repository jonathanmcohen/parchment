import { describe, expect, it } from 'vitest'
import { buildRenameRequest } from '@/lib/docs/rename-request'

// S3-1: the inline-title blur handler must persist the new title via the
// EXISTING title-only endpoint `POST /api/docs/:id/rename` with `{ title }` and
// nothing else. It must NEVER use the body-PUT (`PUT /api/docs/:id` with
// `{ contentJson, markdown }`), which would write an empty body — the I4
// clobber. This pure descriptor lets the unit gate prove the request shape
// without a network round-trip.

describe('buildRenameRequest', () => {
  it('targets the title-only /rename endpoint with POST', () => {
    const req = buildRenameRequest('abc-123', 'New title')
    expect(req).not.toBeNull()
    expect(req?.url).toBe('/api/docs/abc-123/rename')
    expect(req?.method).toBe('POST')
  })

  it('sends ONLY the title — never contentJson/markdown (I4 clobber guard)', () => {
    const req = buildRenameRequest('abc-123', 'New title')
    expect(req?.body).toEqual({ title: 'New title' })
    expect(req?.body).not.toHaveProperty('contentJson')
    expect(req?.body).not.toHaveProperty('markdown')
    // It must not be the body-PUT route.
    expect(req?.url).not.toBe('/api/docs/abc-123')
    expect(req?.method).not.toBe('PUT')
  })

  it('trims surrounding whitespace from the title', () => {
    expect(buildRenameRequest('d1', '  Spaced  ')?.body).toEqual({ title: 'Spaced' })
  })

  it('returns null for an empty/whitespace-only title (no clobbering POST)', () => {
    expect(buildRenameRequest('d1', '')).toBeNull()
    expect(buildRenameRequest('d1', '   ')).toBeNull()
  })

  it('returns null when the title is unchanged (no needless write)', () => {
    expect(buildRenameRequest('d1', 'Same', 'Same')).toBeNull()
    expect(buildRenameRequest('d1', '  Same  ', 'Same')).toBeNull()
  })

  it('returns a request when the title genuinely changed from the previous one', () => {
    expect(buildRenameRequest('d1', 'Changed', 'Original')?.body).toEqual({ title: 'Changed' })
  })
})
