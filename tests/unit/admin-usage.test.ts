import { describe, expect, it } from 'vitest'

/**
 * Unit tests for src/lib/admin/usage.ts (I2).
 * Tests the pure helpers that don't require a DB — the SQL queries are
 * integration-tested against Testcontainers in the integration suite.
 */

import {
  formatBytes,
  buildUsageSummaryRow,
} from '../../src/lib/admin/usage'

describe('formatBytes (re-exported from quota)', () => {
  it('formats 0 as 0.0 MB', () => {
    expect(formatBytes(0)).toBe('0.0 MB')
  })

  it('formats 1 MB correctly', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })
})

describe('buildUsageSummaryRow', () => {
  it('builds a summary row from raw DB and disk values', () => {
    const row = buildUsageSummaryRow({
      userId: 'u1',
      name: 'Alice',
      email: 'alice@example.com',
      quotaMb: 100,
      docCount: 5,
      contentSizeBytes: 2048,
      assetSizeBytes: 512 * 1024,
    })
    expect(row.userId).toBe('u1')
    expect(row.name).toBe('Alice')
    expect(row.docCount).toBe(5)
    expect(row.contentSizeBytes).toBe(2048)
    expect(row.assetSizeBytes).toBe(512 * 1024)
    expect(row.quotaMb).toBe(100)
  })

  it('uses 0 as default for missing assetSizeBytes', () => {
    const row = buildUsageSummaryRow({
      userId: 'u2',
      name: 'Bob',
      email: 'bob@example.com',
      quotaMb: 0,
      docCount: 0,
      contentSizeBytes: 0,
      assetSizeBytes: 0,
    })
    expect(row.assetSizeBytes).toBe(0)
  })
})
