import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { getUsedAssetBytes, formatBytes, checkQuota } from '../../src/lib/quota'

/**
 * Unit tests for src/lib/quota.ts (I2).
 * Uses a real temp filesystem (no DB) for the asset-size measurement.
 */

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'parchment-quota-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('getUsedAssetBytes', () => {
  it('returns 0 when no assets directory exists', async () => {
    const bytes = await getUsedAssetBytes([], join(tmpDir, 'nonexistent'))
    expect(bytes).toBe(0)
  })

  it('returns 0 when assets root exists but has no doc subdirectories', async () => {
    const assetsRoot = join(tmpDir, '.assets')
    await mkdir(assetsRoot, { recursive: true })
    const bytes = await getUsedAssetBytes([], assetsRoot)
    expect(bytes).toBe(0)
  })

  it('returns sum of file sizes under provided doc ids', async () => {
    const assetsRoot = join(tmpDir, '.assets')
    const docDir = join(assetsRoot, 'doc-abc')
    await mkdir(docDir, { recursive: true })
    await writeFile(join(docDir, 'image1.png'), Buffer.alloc(1024)) // 1 KB
    await writeFile(join(docDir, 'image2.png'), Buffer.alloc(2048)) // 2 KB

    const bytes = await getUsedAssetBytes(['doc-abc'], assetsRoot)
    expect(bytes).toBe(1024 + 2048)
  })

  it('ignores docs not in the provided list', async () => {
    const assetsRoot = join(tmpDir, '.assets')
    const docDir1 = join(assetsRoot, 'doc-mine')
    const docDir2 = join(assetsRoot, 'doc-other')
    await mkdir(docDir1, { recursive: true })
    await mkdir(docDir2, { recursive: true })
    await writeFile(join(docDir1, 'a.png'), Buffer.alloc(500))
    await writeFile(join(docDir2, 'b.png'), Buffer.alloc(999))

    const bytes = await getUsedAssetBytes(['doc-mine'], assetsRoot)
    expect(bytes).toBe(500) // only doc-mine counted
  })
})

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0.0 MB')
  })

  it('formats 1048576 bytes as 1.0 MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })

  it('formats 512 * 1024 bytes as 0.5 MB', () => {
    expect(formatBytes(512 * 1024)).toBe('0.5 MB')
  })
})

describe('checkQuota', () => {
  it('allows upload when quotaMb is 0 (unlimited)', () => {
    expect(checkQuota({ quotaMb: 0, usedBytes: 999_999_999, fileBytes: 100 })).toBe(true)
  })

  it('allows upload when used + file <= quota', () => {
    const quotaMb = 10
    const usedBytes = 9 * 1024 * 1024  // 9 MB
    const fileBytes = 512 * 1024        // 0.5 MB — total 9.5 MB <= 10 MB
    expect(checkQuota({ quotaMb, usedBytes, fileBytes })).toBe(true)
  })

  it('blocks upload when used + file > quota', () => {
    const quotaMb = 10
    const usedBytes = 10 * 1024 * 1024 // 10 MB already used
    const fileBytes = 1                  // 1 extra byte would exceed quota
    expect(checkQuota({ quotaMb, usedBytes, fileBytes })).toBe(false)
  })

  it('blocks upload exactly at boundary (> not >=)', () => {
    const quotaMb = 1
    const quotaBytes = 1024 * 1024
    // Exactly at quota — not over
    expect(checkQuota({ quotaMb, usedBytes: quotaBytes - 100, fileBytes: 100 })).toBe(true)
    // One byte over
    expect(checkQuota({ quotaMb, usedBytes: quotaBytes - 100, fileBytes: 101 })).toBe(false)
  })
})
