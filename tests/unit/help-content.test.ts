import { describe, expect, it } from 'vitest'
import { RELEASE_NOTES, SHORTCUTS, TOUR_STEPS } from '@/lib/help/content'
import { APP_VERSION } from '@/lib/version'

describe('SHORTCUTS', () => {
  it('is non-empty', () => {
    expect(SHORTCUTS.length).toBeGreaterThan(0)
  })

  it('every entry has non-empty keys and label strings', () => {
    for (const s of SHORTCUTS) {
      expect(typeof s.keys).toBe('string')
      expect(s.keys.length).toBeGreaterThan(0)
      expect(typeof s.label).toBe('string')
      expect(s.label.length).toBeGreaterThan(0)
    }
  })
})

describe('TOUR_STEPS', () => {
  it('is non-empty', () => {
    expect(TOUR_STEPS.length).toBeGreaterThan(0)
  })

  it('every step has non-empty title and body strings', () => {
    for (const step of TOUR_STEPS) {
      expect(typeof step.title).toBe('string')
      expect(step.title.length).toBeGreaterThan(0)
      expect(typeof step.body).toBe('string')
      expect(step.body.length).toBeGreaterThan(0)
    }
  })
})

describe('RELEASE_NOTES', () => {
  it('has the current APP_VERSION', () => {
    expect(RELEASE_NOTES.version).toBe(APP_VERSION)
  })

  it('has non-empty highlights', () => {
    expect(RELEASE_NOTES.highlights.length).toBeGreaterThan(0)
    for (const h of RELEASE_NOTES.highlights) {
      expect(typeof h).toBe('string')
      expect(h.length).toBeGreaterThan(0)
    }
  })
})
