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

  it('hashes stably regardless of key order', () => {
    const a = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] }
    const b = { content: [{ attrs: { level: 1 }, type: 'heading' }], type: 'doc' }
    expect(stableContentHash(a)).toBe(stableContentHash(b))
  })

  it('produces one managed hash per shipped version (changelog suffix)', () => {
    expect(managedReleaseNotesHashes().size).toBe(CHANGELOG.length)
  })
})
