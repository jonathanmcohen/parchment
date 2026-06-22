// @vitest-environment node
//
// G6c: unit tests for the drawio.ts helper.
// Verifies the env-gate (NEXT_PUBLIC_DRAWIO_EMBED_URL), URL construction, and
// SVG data-URI decoding. Runs in the node env — no DOM, no drawio imports.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { drawioEmbedSrc, drawioEmbedUrl, drawioEnabled, parseDrawioExport } from '@/lib/editor/drawio'

const ENV_KEY = 'NEXT_PUBLIC_DRAWIO_EMBED_URL'
const TEST_URL = 'https://embed.diagrams.net'

describe('G6c — drawio helper', () => {
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

  describe('with NEXT_PUBLIC_DRAWIO_EMBED_URL unset', () => {
    beforeEach(() => {
      // biome-ignore lint/performance/noDelete: must unset env var for this test group
      delete process.env[ENV_KEY]
    })

    it('drawioEmbedUrl() returns null', () => {
      expect(drawioEmbedUrl()).toBeNull()
    })

    it('drawioEnabled() returns false', () => {
      expect(drawioEnabled()).toBe(false)
    })
  })

  describe('with NEXT_PUBLIC_DRAWIO_EMBED_URL set', () => {
    beforeEach(() => {
      process.env[ENV_KEY] = TEST_URL
    })

    it('drawioEmbedUrl() returns the configured URL', () => {
      expect(drawioEmbedUrl()).toBe(TEST_URL)
    })

    it('drawioEnabled() returns true', () => {
      expect(drawioEnabled()).toBe(true)
    })
  })

  describe('drawioEmbedSrc', () => {
    it('contains embed=1 and proto=json', () => {
      const src = drawioEmbedSrc(TEST_URL)
      expect(src).toContain('embed=1')
      expect(src).toContain('proto=json')
    })

    it('contains all required query params', () => {
      const src = drawioEmbedSrc(TEST_URL)
      expect(src).toContain('spin=1')
      expect(src).toContain('libraries=1')
      expect(src).toContain('saveAndExit=1')
    })
  })

  describe('parseDrawioExport', () => {
    it('decodes a known base64 SVG data-URI to an SVG string', () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
      // btoa encodes a string to base64; atob decodes. In Node, use Buffer.
      const b64 = Buffer.from(svg).toString('base64')
      const dataUri = `data:image/svg+xml;base64,${b64}`
      const result = parseDrawioExport(dataUri)
      expect(result).toBe(svg)
      expect(result).toMatch(/^<svg/)
    })

    it('returns null for a malformed / non-SVG data URI', () => {
      expect(parseDrawioExport('data:text/html;base64,abc')).toBeNull()
      expect(parseDrawioExport('not-a-data-uri')).toBeNull()
      expect(parseDrawioExport('')).toBeNull()
    })

    it('returns null for invalid base64', () => {
      // A data URI with the correct prefix but garbage base64
      const result = parseDrawioExport('data:image/svg+xml;base64,!!!not-valid-base64!!!')
      expect(result).toBeNull()
    })
  })
})
