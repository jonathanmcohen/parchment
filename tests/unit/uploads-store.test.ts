// @vitest-environment node
// J1-3: unit tests for src/lib/uploads/store.ts — disk vs S3 storage adapter.
// Disk write lands at the resolved path; the S3 branch calls uploadToS3 with the
// assets/-prefixed key (mocked); getAsset returns null for a missing key without
// throwing.

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DOC = { id: '22222222-2222-2222-2222-222222222222' }

// Mock the shared S3 module so the S3 branch can be asserted without AWS.
const uploadMock = vi.fn(async () => {})
const getObjectMock = vi.fn(async () => null as Uint8Array | null)
let s3Configured = false

vi.mock('@/lib/backup/s3', () => ({
  isS3Configured: () => s3Configured,
  uploadToS3: (...args: unknown[]) => uploadMock(...(args as [])),
  getObjectFromS3: (...args: unknown[]) => getObjectMock(...(args as [])),
}))

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'parchment-assets-'))
  process.env.PARCHMENT_FILES_ROOT = root
  s3Configured = false
  uploadMock.mockClear()
  getObjectMock.mockClear()
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('store — disk branch', () => {
  it('putAsset writes the bytes to .assets/<docId>/<name> under the files root', async () => {
    const { putAsset } = await import('@/lib/uploads/store')
    const { safeAssetName } = await import('@/lib/uploads/asset-path')
    const name = safeAssetName('x', 'png')
    const bytes = new Uint8Array([1, 2, 3, 4])
    await putAsset(DOC, name, bytes, 'image/png')
    const onDisk = await readFile(join(root, '.assets', DOC.id, name))
    expect(new Uint8Array(onDisk)).toEqual(bytes)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('getAsset reads back the bytes from disk', async () => {
    const { putAsset, getAsset } = await import('@/lib/uploads/store')
    const { safeAssetName } = await import('@/lib/uploads/asset-path')
    const name = safeAssetName('x', 'pdf')
    const bytes = new Uint8Array([9, 8, 7])
    await putAsset(DOC, name, bytes, 'application/pdf')
    const got = await getAsset(DOC, name)
    expect(got).not.toBeNull()
    expect(new Uint8Array(got!)).toEqual(bytes)
  })

  it('getAsset returns null for a missing key without throwing', async () => {
    const { getAsset } = await import('@/lib/uploads/store')
    const { safeAssetName } = await import('@/lib/uploads/asset-path')
    const got = await getAsset(DOC, safeAssetName('missing', 'png'))
    expect(got).toBeNull()
  })

  it('putAsset rejects an unsafe filename (defense in depth)', async () => {
    const { putAsset } = await import('@/lib/uploads/store')
    await expect(
      putAsset(DOC, '../../escape.png', new Uint8Array([1]), 'image/png'),
    ).rejects.toThrow()
  })
})

describe('store — S3 branch', () => {
  it('putAsset calls uploadToS3 with the assets/-prefixed key and does NOT write disk', async () => {
    s3Configured = true
    const { putAsset } = await import('@/lib/uploads/store')
    const { safeAssetName } = await import('@/lib/uploads/asset-path')
    const name = safeAssetName('x', 'png')
    const bytes = new Uint8Array([5, 6, 7])
    await putAsset(DOC, name, bytes, 'image/png')
    expect(uploadMock).toHaveBeenCalledTimes(1)
    const [key, body, ct] = uploadMock.mock.calls[0] as unknown as [string, Uint8Array, string]
    expect(key).toBe(`assets/${DOC.id}/${name}`)
    expect(new Uint8Array(body)).toEqual(bytes)
    expect(ct).toBe('image/png')
  })

  it('getAsset calls getObjectFromS3 with the prefixed key and returns its bytes', async () => {
    s3Configured = true
    const want = new Uint8Array([4, 2])
    getObjectMock.mockResolvedValueOnce(want)
    const { getAsset } = await import('@/lib/uploads/store')
    const { safeAssetName } = await import('@/lib/uploads/asset-path')
    const name = safeAssetName('x', 'png')
    const got = await getAsset(DOC, name)
    expect(getObjectMock).toHaveBeenCalledWith(`assets/${DOC.id}/${name}`)
    expect(got).toEqual(want)
  })

  it('getAsset returns null when S3 has no object (getObjectFromS3 → null)', async () => {
    s3Configured = true
    getObjectMock.mockResolvedValueOnce(null)
    const { getAsset } = await import('@/lib/uploads/store')
    const { safeAssetName } = await import('@/lib/uploads/asset-path')
    const got = await getAsset(DOC, safeAssetName('x', 'png'))
    expect(got).toBeNull()
  })
})
