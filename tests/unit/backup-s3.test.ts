import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// s3.ts uses 'server-only' — mock it so tests don't fail on import.
vi.mock('server-only', () => ({}))

// Capture what PutObjectCommand was constructed with, and that the client sent it.
const sendMock = vi.fn().mockResolvedValue({})
const putCtorMock = vi.fn()
const clientCtorMock = vi.fn()

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = sendMock
    constructor(cfg: unknown) {
      clientCtorMock(cfg)
    }
  },
  PutObjectCommand: class {
    input: unknown
    constructor(input: unknown) {
      this.input = input
      putCtorMock(input)
    }
  },
}))

const S3_VARS = [
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
  'BACKUP_S3_REGION',
] as const

describe('I4 — isS3Configured', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of S3_VARS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
    vi.resetModules()
  })

  afterEach(() => {
    for (const k of S3_VARS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('is false when no vars are set', async () => {
    const { isS3Configured } = await import('@/lib/backup/s3')
    expect(isS3Configured()).toBe(false)
  })

  it('is false when any one of the four required vars is missing', async () => {
    process.env.BACKUP_S3_ENDPOINT = 'https://minio.local'
    process.env.BACKUP_S3_BUCKET = 'parchment'
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'key'
    // SECRET intentionally missing
    const { isS3Configured } = await import('@/lib/backup/s3')
    expect(isS3Configured()).toBe(false)
  })

  it('is true when all four required vars are set', async () => {
    process.env.BACKUP_S3_ENDPOINT = 'https://minio.local'
    process.env.BACKUP_S3_BUCKET = 'parchment'
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'key'
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret'
    const { isS3Configured } = await import('@/lib/backup/s3')
    expect(isS3Configured()).toBe(true)
  })
})

describe('I4 — uploadToS3', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of S3_VARS) {
      saved[k] = process.env[k]
    }
    process.env.BACKUP_S3_ENDPOINT = 'https://minio.local'
    process.env.BACKUP_S3_BUCKET = 'parchment-bucket'
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'AKIA'
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'shh'
    delete process.env.BACKUP_S3_REGION
    sendMock.mockClear()
    putCtorMock.mockClear()
    clientCtorMock.mockClear()
    vi.resetModules()
  })

  afterEach(() => {
    for (const k of S3_VARS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('sends a PutObjectCommand with the right Bucket / Key / Body / ContentType', async () => {
    const { uploadToS3 } = await import('@/lib/backup/s3')
    const body = new Uint8Array([1, 2, 3, 4])
    await uploadToS3('parchment-backup-2026.zip', body)

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(putCtorMock).toHaveBeenCalledWith({
      Bucket: 'parchment-bucket',
      Key: 'parchment-backup-2026.zip',
      Body: body,
      ContentType: 'application/zip',
    })
    // S3Client built with forcePathStyle + endpoint + default region.
    expect(clientCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://minio.local',
        forcePathStyle: true,
        region: 'us-east-1',
        credentials: { accessKeyId: 'AKIA', secretAccessKey: 'shh' },
      }),
    )
  })

  it('throws when called while not configured (missing env)', async () => {
    delete process.env.BACKUP_S3_BUCKET
    const { uploadToS3 } = await import('@/lib/backup/s3')
    await expect(uploadToS3('k.zip', new Uint8Array([1]))).rejects.toThrow(/not configured/)
  })
})
