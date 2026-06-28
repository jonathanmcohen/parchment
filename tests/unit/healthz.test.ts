import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/healthz/route'

describe('GET /api/healthz', () => {
  it('returns 200 with {"status":"ok"}', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })
})
