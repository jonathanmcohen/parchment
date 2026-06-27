import { beforeEach, describe, expect, it, vi } from 'vitest'

// Unit tests for src/lib/config/smtp-config-repo.ts
// All @/lib/config/repo and @/lib/crypto/secret-box deps are mocked.

const { setAppConfig, getAppConfig, deleteAppConfig, setAppConfigJson, getAppConfigJson } =
  vi.hoisted(() => ({
    setAppConfig: vi.fn<() => Promise<void>>(),
    getAppConfig: vi.fn<() => Promise<string | null>>(),
    deleteAppConfig: vi.fn<() => Promise<void>>(),
    setAppConfigJson: vi.fn<() => Promise<void>>(),
    getAppConfigJson: vi.fn<() => Promise<unknown>>(),
  }))

vi.mock('@/lib/config/repo', () => ({
  setAppConfig,
  getAppConfig,
  deleteAppConfig,
  setAppConfigJson,
  getAppConfigJson,
}))

const SECRET_MASK = '••••••••'
vi.mock('@/lib/crypto/secret-box', () => ({
  SECRET_MASK: '••••••••',
  isMasked: (v: string) => v === '••••••••',
}))

import {
  clearSmtpConfig,
  getSmtpConfig,
  getSmtpPasswordMasked,
  isSmtpConfigured,
  saveSmtpConfig,
} from '@/lib/config/smtp-config-repo'

const VALID_CONFIG = {
  host: 'smtp.example.com',
  port: 587,
  user: 'user@example.com',
  fromAddress: 'noreply@example.com',
  tls: 'starttls' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isSmtpConfigured', () => {
  it('returns false when smtp_config is not set', async () => {
    getAppConfigJson.mockResolvedValue(null)
    const result = await isSmtpConfigured()
    expect(result).toBe(false)
    expect(getAppConfigJson).toHaveBeenCalledWith('smtp_config')
  })

  it('returns true when smtp_config exists', async () => {
    getAppConfigJson.mockResolvedValue(VALID_CONFIG)
    const result = await isSmtpConfigured()
    expect(result).toBe(true)
  })
})

describe('saveSmtpConfig + getSmtpConfig round-trip', () => {
  it('saves non-password fields via setAppConfigJson and returns them via getSmtpConfig', async () => {
    setAppConfigJson.mockResolvedValue(undefined)
    setAppConfig.mockResolvedValue(undefined)
    getAppConfigJson.mockResolvedValue(VALID_CONFIG)

    await saveSmtpConfig({ ...VALID_CONFIG, password: 'secret123' })

    // should have persisted the non-secret fields
    expect(setAppConfigJson).toHaveBeenCalledWith('smtp_config', VALID_CONFIG)
    // should have persisted the password separately
    expect(setAppConfig).toHaveBeenCalledWith('smtp_password', 'secret123')

    const config = await getSmtpConfig()
    expect(config).toEqual(VALID_CONFIG)
  })

  it('getSmtpConfig returns null when no config is stored', async () => {
    getAppConfigJson.mockResolvedValue(null)
    const config = await getSmtpConfig()
    expect(config).toBeNull()
  })
})

describe('getSmtpPasswordMasked', () => {
  it('returns SECRET_MASK after a save with a password', async () => {
    getAppConfig.mockResolvedValue('the-decrypted-password')
    const masked = await getSmtpPasswordMasked()
    expect(masked).toBe(SECRET_MASK)
    expect(getAppConfig).toHaveBeenCalledWith('smtp_password')
  })

  it('returns null when no password is stored', async () => {
    getAppConfig.mockResolvedValue(null)
    const masked = await getSmtpPasswordMasked()
    expect(masked).toBeNull()
  })
})

describe('getSmtpConfig does not expose password', () => {
  it('returned config has no password field', async () => {
    getAppConfigJson.mockResolvedValue(VALID_CONFIG)
    const config = await getSmtpConfig()
    expect(config).not.toHaveProperty('password')
    // Verify the raw password string does not appear as any value
    const values = config ? Object.values(config) : []
    for (const v of values) {
      expect(v).not.toBe('secret123')
    }
  })
})

describe('isMasked guard on save', () => {
  it('does not overwrite stored password when password === SECRET_MASK', async () => {
    setAppConfigJson.mockResolvedValue(undefined)
    setAppConfig.mockResolvedValue(undefined)

    await saveSmtpConfig({ ...VALID_CONFIG, password: SECRET_MASK })

    // Config blob should be saved (host/port/etc.)
    expect(setAppConfigJson).toHaveBeenCalledWith('smtp_config', VALID_CONFIG)
    // But the password call must NOT have been made (leave stored password unchanged)
    expect(setAppConfig).not.toHaveBeenCalledWith('smtp_password', expect.anything())
  })
})

describe('clearSmtpConfig', () => {
  it('removes both keys and isSmtpConfigured returns false afterward', async () => {
    deleteAppConfig.mockResolvedValue(undefined)
    getAppConfigJson.mockResolvedValue(null)

    await clearSmtpConfig()

    expect(deleteAppConfig).toHaveBeenCalledWith('smtp_config')
    expect(deleteAppConfig).toHaveBeenCalledWith('smtp_password')

    const configured = await isSmtpConfigured()
    expect(configured).toBe(false)
  })
})

describe('port is stored and retrieved as number', () => {
  it('port round-trips as a number, not a string', async () => {
    setAppConfigJson.mockResolvedValue(undefined)
    setAppConfig.mockResolvedValue(undefined)
    // Simulate DB returning the port as a number
    getAppConfigJson.mockResolvedValue({ ...VALID_CONFIG, port: 587 })

    await saveSmtpConfig({ ...VALID_CONFIG, port: 587, password: 'pw' })

    const [, savedObj] = setAppConfigJson.mock.calls[0] as [string, { port: number }]
    expect(typeof savedObj.port).toBe('number')
    expect(savedObj.port).toBe(587)

    const config = await getSmtpConfig()
    expect(typeof config?.port).toBe('number')
    expect(config?.port).toBe(587)
  })
})
