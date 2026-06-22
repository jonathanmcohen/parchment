// @vitest-environment node
//
// G6b: unit tests for the plantuml.ts helper.
// Verifies the env-gate (NEXT_PUBLIC_PLANTUML_SERVER_URL) and URL construction.
// Runs in the node env — no DOM, no mermaid, no plantuml rendering.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { plantumlEnabled, plantumlImageUrl } from '@/lib/editor/plantuml'

const ENV_KEY = 'NEXT_PUBLIC_PLANTUML_SERVER_URL'
const TEST_SERVER = 'https://www.plantuml.com/plantuml'
const SAMPLE_SOURCE = '@startuml\nA -> B : hello\n@enduml'

describe('G6b — plantuml helper', () => {
  let originalValue: string | undefined

  beforeEach(() => {
    originalValue = process.env[ENV_KEY]
  })

  afterEach(() => {
    if (originalValue === undefined) {
      // biome-ignore lint/performance/noDelete: must unset to restore original absence
      delete process.env[ENV_KEY]
    } else {
      process.env[ENV_KEY] = originalValue
    }
  })

  describe('with NEXT_PUBLIC_PLANTUML_SERVER_URL unset', () => {
    beforeEach(() => {
      // biome-ignore lint/performance/noDelete: must unset env var for this test group
      delete process.env[ENV_KEY]
    })

    it('plantumlEnabled() returns false', () => {
      expect(plantumlEnabled()).toBe(false)
    })

    it('plantumlImageUrl returns null (disabled)', () => {
      expect(plantumlImageUrl(SAMPLE_SOURCE)).toBeNull()
    })
  })

  describe('with NEXT_PUBLIC_PLANTUML_SERVER_URL set', () => {
    beforeEach(() => {
      process.env[ENV_KEY] = TEST_SERVER
    })

    it('plantumlEnabled() returns true', () => {
      expect(plantumlEnabled()).toBe(true)
    })

    it('plantumlImageUrl returns a URL containing /svg/ and a non-empty token', () => {
      const url = plantumlImageUrl(SAMPLE_SOURCE)
      expect(url).not.toBeNull()
      expect(url).toContain('/svg/')
      // The encoded token after /svg/ must be non-empty
      const token = url!.split('/svg/')[1]
      expect(token).toBeTruthy()
      expect(token!.length).toBeGreaterThan(0)
    })

    it('plantumlImageUrl includes the server base in the URL', () => {
      const url = plantumlImageUrl(SAMPLE_SOURCE)
      expect(url).toContain(TEST_SERVER)
    })

    it('plantumlImageUrl returns null for empty source', () => {
      expect(plantumlImageUrl('')).toBeNull()
      expect(plantumlImageUrl('   ')).toBeNull()
    })
  })
})
