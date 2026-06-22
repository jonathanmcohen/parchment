import { describe, expect, it } from 'vitest'
import {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
} from '@/lib/docs/builtin-templates'

// G2: bundled templates are pure data — no db/React. Each must carry a usable
// key/name and valid ProseMirror `doc` JSON so the from-template route can seed
// a fresh document directly from it.

describe('G2 — builtin templates', () => {
  it('ships a non-empty gallery', () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(5)
  })

  it('every template has a non-empty key + name and a non-empty doc body', () => {
    const keys = new Set<string>()
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.key.trim().length).toBeGreaterThan(0)
      expect(t.name.trim().length).toBeGreaterThan(0)
      expect(t.description.trim().length).toBeGreaterThan(0)
      expect(t.content.type).toBe('doc')
      expect(Array.isArray(t.content.content)).toBe(true)
      expect((t.content.content as unknown[]).length).toBeGreaterThan(0)
      keys.add(t.key)
    }
    // keys are unique
    expect(keys.size).toBe(BUILTIN_TEMPLATES.length)
  })

  it('only uses node types in the editor schema', () => {
    const allowed = new Set(['paragraph', 'heading', 'bulletList', 'listItem', 'text'])
    const walk = (node: Record<string, unknown>): void => {
      const children = node.content
      if (Array.isArray(children)) {
        for (const child of children) {
          const c = child as Record<string, unknown>
          expect(allowed.has(c.type as string)).toBe(true)
          walk(c)
        }
      }
    }
    for (const t of BUILTIN_TEMPLATES) walk(t.content as unknown as Record<string, unknown>)
  })

  it('getBuiltinTemplate resolves a known key and returns undefined for an unknown one', () => {
    const meeting = getBuiltinTemplate('meeting-notes')
    expect(meeting).toBeDefined()
    expect(meeting?.name).toBeTruthy()
    expect(getBuiltinTemplate('does-not-exist')).toBeUndefined()
  })
})
