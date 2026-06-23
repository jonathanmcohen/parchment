import { describe, expect, it } from 'vitest'
import { GUIDE_DOC_TITLES, GUIDE_DOCS, GUIDE_FOLDER_NAME } from '@/lib/docs/seed-guide-content'
import { APP_VERSION } from '@/lib/version'

// L6: the first-run guide content is PURE data (no db/React), so it is unit-
// testable without Postgres. seedGuideWorkspace passes each doc's `content`
// straight to createDocument, which serializes it to markdown + mirrors it to
// disk — so the PM JSON must be well-formed and use only editor-schema nodes.

describe('L6 — Parchment Guide seed content', () => {
  it('has the expected doc titles, in order', () => {
    expect(GUIDE_DOCS.map((d) => d.title)).toEqual([
      'Welcome to Parchment',
      'The editor & slash menu',
      'Sharing & export',
      'Settings & integrations',
      `Release notes — v${APP_VERSION}`,
    ])
    // GUIDE_DOC_TITLES is the same list (used by the seeder + this test).
    expect(GUIDE_DOC_TITLES).toEqual(GUIDE_DOCS.map((d) => d.title))
    expect(GUIDE_FOLDER_NAME).toBe('Parchment Guide')
  })

  it('every doc is well-formed, non-empty ProseMirror `doc` JSON', () => {
    for (const doc of GUIDE_DOCS) {
      expect(doc.title.trim().length).toBeGreaterThan(0)
      expect(doc.content.type).toBe('doc')
      expect(Array.isArray(doc.content.content)).toBe(true)
      expect(doc.content.content.length).toBeGreaterThan(0)
    }
  })

  it('only uses node types in the editor schema', () => {
    const allowed = new Set(['paragraph', 'heading', 'bulletList', 'listItem', 'text'])
    const walk = (node: Record<string, unknown>): void => {
      // A text node carries a non-empty string; a block node carries children.
      if (node.type === 'text') {
        expect(typeof node.text).toBe('string')
        expect((node.text as string).length).toBeGreaterThan(0)
      }
      const children = node.content
      if (Array.isArray(children)) {
        for (const child of children) {
          const c = child as Record<string, unknown>
          expect(allowed.has(c.type as string)).toBe(true)
          walk(c)
        }
      }
    }
    for (const doc of GUIDE_DOCS) walk(doc.content as unknown as Record<string, unknown>)
  })

  it('the release-notes doc includes the current version', () => {
    const releaseDoc = GUIDE_DOCS.find((d) => d.key === 'release-notes')
    expect(releaseDoc).toBeDefined()
    expect(releaseDoc?.title).toContain(APP_VERSION)
    // The version also appears in the rendered body text.
    const flat = JSON.stringify(releaseDoc?.content)
    expect(flat).toContain(APP_VERSION)
  })
})
