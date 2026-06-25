import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCollabUrl } from '@/lib/editor/collab-url'

// V6: the collab ws URL must be derived at RUNTIME from the page origin so one
// prebuilt image works for any deploy origin (NEXT_PUBLIC_* bakes at build time).

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const withWindow = (protocol: string, host: string) =>
  vi.stubGlobal('window', { location: { protocol, host } })

describe('getCollabUrl', () => {
  it('an explicit NEXT_PUBLIC_COLLAB_URL wins (escape hatch)', () => {
    vi.stubEnv('NEXT_PUBLIC_COLLAB_URL', 'ws://collab.example:9999')
    vi.stubEnv('NODE_ENV', 'production')
    withWindow('https:', 'parchment.example.com')
    expect(getCollabUrl()).toBe('ws://collab.example:9999')
  })

  it('dev falls back to the separate ws://localhost:1234 collab server', () => {
    vi.stubEnv('NEXT_PUBLIC_COLLAB_URL', '')
    vi.stubEnv('NODE_ENV', 'development')
    withWindow('http:', 'localhost:3000')
    expect(getCollabUrl()).toBe('ws://localhost:1234')
  })

  it('production https origin derives wss://<host>/collab', () => {
    vi.stubEnv('NEXT_PUBLIC_COLLAB_URL', '')
    vi.stubEnv('NODE_ENV', 'production')
    withWindow('https:', 'parchment.local.jonco.dev')
    expect(getCollabUrl()).toBe('wss://parchment.local.jonco.dev/collab')
  })

  it('production http origin derives ws://<host>/collab', () => {
    vi.stubEnv('NEXT_PUBLIC_COLLAB_URL', '')
    vi.stubEnv('NODE_ENV', 'production')
    withWindow('http:', 'parchment.lan:8080')
    expect(getCollabUrl()).toBe('ws://parchment.lan:8080/collab')
  })

  it('SSR (no window) returns the safe localhost default', () => {
    vi.stubEnv('NEXT_PUBLIC_COLLAB_URL', '')
    vi.stubEnv('NODE_ENV', 'production')
    // window intentionally not stubbed → typeof window === 'undefined' in node.
    expect(getCollabUrl()).toBe('ws://localhost:1234')
  })
})
