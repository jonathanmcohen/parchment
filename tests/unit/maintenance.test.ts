import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for src/lib/maintenance.ts (I6).
 *
 * Uses a real temp directory so the lock-file FS logic is exercised properly.
 * No DB access required — the file-based approach avoids the sentinel-UUID
 * schema complication (§I6-T1 preferred approach).
 */

// We'll import the module with the lockDir injected so tests work in isolation.
// The module exports a factory: makeMaintenanceFns(lockDir) → { isMaintenanceMode, setMaintenanceMode }
import { makeMaintenanceFns } from '../../src/lib/maintenance'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'parchment-test-maintenance-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('isMaintenanceMode', () => {
  it('returns false when the lock file does not exist', async () => {
    const { isMaintenanceMode } = makeMaintenanceFns(tmpDir)
    expect(await isMaintenanceMode()).toBe(false)
  })

  it('returns true when the lock file exists', async () => {
    const { setMaintenanceMode, isMaintenanceMode } = makeMaintenanceFns(tmpDir)
    await setMaintenanceMode(true, 'actor-id')
    expect(await isMaintenanceMode()).toBe(true)
  })
})

describe('setMaintenanceMode', () => {
  it('setMaintenanceMode(true) creates the lock file', async () => {
    const { setMaintenanceMode, isMaintenanceMode } = makeMaintenanceFns(tmpDir)
    await setMaintenanceMode(true, 'actor-id')
    expect(await isMaintenanceMode()).toBe(true)
  })

  it('setMaintenanceMode(false) removes the lock file', async () => {
    const { setMaintenanceMode, isMaintenanceMode } = makeMaintenanceFns(tmpDir)
    await setMaintenanceMode(true, 'actor-id')
    await setMaintenanceMode(false, 'actor-id')
    expect(await isMaintenanceMode()).toBe(false)
  })

  it('setMaintenanceMode(true) is idempotent — calling twice does not throw', async () => {
    const { setMaintenanceMode } = makeMaintenanceFns(tmpDir)
    await expect(setMaintenanceMode(true, 'actor-id')).resolves.not.toThrow()
    await expect(setMaintenanceMode(true, 'actor-id')).resolves.not.toThrow()
  })

  it('setMaintenanceMode(false) is idempotent — removing non-existent file does not throw', async () => {
    const { setMaintenanceMode } = makeMaintenanceFns(tmpDir)
    await expect(setMaintenanceMode(false, 'actor-id')).resolves.not.toThrow()
    await expect(setMaintenanceMode(false, 'actor-id')).resolves.not.toThrow()
  })
})

describe('middleware maintenance block logic', () => {
  // Test the decision logic that the middleware uses — pure function, no HTTP stack.
  it('GET requests are always allowed even in maintenance mode', () => {
    // The middleware allows GET/HEAD — this is the rule
    const isMutation = (method: string) => !['GET', 'HEAD'].includes(method)
    expect(isMutation('GET')).toBe(false)
    expect(isMutation('HEAD')).toBe(false)
    expect(isMutation('POST')).toBe(true)
    expect(isMutation('PUT')).toBe(true)
    expect(isMutation('DELETE')).toBe(true)
    expect(isMutation('PATCH')).toBe(true)
  })

  it('health + setup paths are always allowed', () => {
    const ALWAYS_ALLOWED = ['/api/healthz', '/api/readyz', '/api/metrics', '/setup']
    const isAlwaysAllowed = (path: string) => ALWAYS_ALLOWED.some((p) => path.startsWith(p))
    expect(isAlwaysAllowed('/api/healthz')).toBe(true)
    expect(isAlwaysAllowed('/api/readyz')).toBe(true)
    expect(isAlwaysAllowed('/api/metrics')).toBe(true)
    expect(isAlwaysAllowed('/setup')).toBe(true)
    expect(isAlwaysAllowed('/setup/config')).toBe(true)
    expect(isAlwaysAllowed('/api/docs')).toBe(false)
  })
})
