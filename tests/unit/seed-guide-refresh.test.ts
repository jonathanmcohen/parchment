import { describe, expect, it } from 'vitest'
import { releaseNotesDocFromChangelog } from '@/lib/docs/seed-guide-content'
import {
  currentReleaseNotesContent,
  isUneditedManagedReleaseNotes,
  managedReleaseNotesHashes,
  stableContentHash,
} from '@/lib/docs/seed-guide-refresh'
import { CHANGELOG } from '@/lib/help/content'

// v0.2.2 #4: edit-safe release-notes refresh. The pure decision logic must:
//  - recognise the CURRENT rendering as managed (refreshable),
//  - recognise a PRIOR-version rendering (changelog suffix) as managed (the homelab
//    doc was seeded at an older version),
//  - treat a user-edited body as NOT managed (never clobber edits),
//  - hash stably regardless of object key order.

describe('#4 — managed release-notes recognition', () => {
  it('recognises the current changelog rendering as unedited/managed', () => {
    expect(isUneditedManagedReleaseNotes(currentReleaseNotesContent())).toBe(true)
  })

  it('recognises a prior-version rendering (changelog suffix) as unedited/managed', () => {
    // The body the app produced at the 2nd-newest version == suffix from index 1.
    const priorVersionBody = releaseNotesDocFromChangelog(CHANGELOG.slice(1))
    expect(isUneditedManagedReleaseNotes(priorVersionBody)).toBe(true)
  })

  it('the oldest-version rendering (single entry) is recognised as managed', () => {
    const oldestBody = releaseNotesDocFromChangelog(CHANGELOG.slice(CHANGELOG.length - 1))
    expect(isUneditedManagedReleaseNotes(oldestBody)).toBe(true)
  })

  it('treats a user-edited body as NOT managed (must not be clobbered)', () => {
    const edited = currentReleaseNotesContent()
    // Simulate a user edit: append a paragraph.
    ;(edited.content as unknown[]).push({
      type: 'paragraph',
      content: [{ type: 'text', text: 'my own note' }],
    })
    expect(isUneditedManagedReleaseNotes(edited)).toBe(false)
  })

  // v0.2.7 #2: merely OPENING the release-notes doc in the editor rewrites its
  // content via the Tiptap schema — every node gains default `textAlign:null` /
  // `firstLineIndent:null` attrs, headings gain an auto-generated `id`, and a
  // trailing empty paragraph is appended. That is NOT a user edit, but an exact
  // hash-match would treat it as one, so the doc would never refresh again (the
  // reported bug). isUneditedManagedReleaseNotes must NORMALISE those editor
  // artifacts away and still recognise the doc as managed.
  it('recognises an editor-NORMALISED (opened, unedited) doc as managed', () => {
    const managed = currentReleaseNotesContent() as {
      content: Array<Record<string, unknown>>
    }
    // Simulate exactly what opening in the editor does to the content:
    const opened = {
      type: 'doc',
      content: managed.content.map((node) => {
        const n = node as { type?: string; attrs?: Record<string, unknown> }
        const withDefaults: Record<string, unknown> = {
          ...node,
          attrs: {
            ...(n.attrs ?? {}),
            textAlign: null,
            firstLineIndent: null,
            ...(n.type === 'heading' ? { id: 'auto-generated-id' } : {}),
          },
        }
        return withDefaults
      }),
    }
    // Editor appends a trailing empty paragraph.
    ;(opened.content as unknown[]).push({
      type: 'paragraph',
      attrs: { textAlign: null, firstLineIndent: null },
    })

    expect(isUneditedManagedReleaseNotes(opened)).toBe(true)
  })

  it('still rejects a genuine edit even after editor normalisation', () => {
    const managed = currentReleaseNotesContent() as {
      content: Array<Record<string, unknown>>
    }
    const openedAndEdited = {
      type: 'doc',
      content: [
        ...managed.content.map((node) => ({
          ...node,
          attrs: { ...((node as { attrs?: object }).attrs ?? {}), textAlign: null },
        })),
        // a REAL user paragraph with text (not an empty trailing one)
        { type: 'paragraph', content: [{ type: 'text', text: 'genuinely mine' }] },
      ],
    }
    expect(isUneditedManagedReleaseNotes(openedAndEdited)).toBe(false)
  })

  it('hashes stably regardless of key order', () => {
    const a = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] }
    const b = { content: [{ attrs: { level: 1 }, type: 'heading' }], type: 'doc' }
    expect(stableContentHash(a)).toBe(stableContentHash(b))
  })

  it('produces one managed hash per shipped version (changelog suffix)', () => {
    expect(managedReleaseNotesHashes().size).toBe(CHANGELOG.length)
  })
})
