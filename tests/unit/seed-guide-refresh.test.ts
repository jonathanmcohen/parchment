import { describe, expect, it } from 'vitest'
import { releaseNotesDocFromChangelog } from '@/lib/docs/seed-guide-content'
import {
  currentReleaseNotesContent,
  isUneditedManagedReleaseNotes,
  managedReleaseNotesMarkdown,
  normalizedReleaseNotesMarkdown,
} from '@/lib/docs/seed-guide-refresh'
import { CHANGELOG } from '@/lib/help/content'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

// v0.2.9 #1 — edit-safe release-notes refresh, reworked to compare NORMALIZED
// MARKDOWN PROJECTIONS rather than ProseMirror-JSON hashes.
//
// WHY: markdown is the canonical disk format, so Yjs / IndexedDB / disk round trips
// are markdown-stable by design (the disk-mirror product guarantee). The v0.2.8
// approach hashed ProseMirror JSON, which is NOT round-trip-stable: the reverse-sync
// watcher re-imports the .md via markdownToJson (adding trailing spaces, dropping
// null attrs, snowballing heading-id comments), the resulting JSON hashes to nothing
// in the managed set, and the doc is misclassified as "edited" → never refreshes.
// That defeated v0.2.8 live (the THIRD shadow: the disk-mirror .md + watcher).
//
// The classifier must:
//  - recognise the CURRENT rendering as managed (refreshable),
//  - recognise a PRIOR-version rendering (changelog suffix) as managed,
//  - recognise the ACTUAL PROD DOC STATE (snowballed heading-id comments + editor
//    artifacts) as managed — this is the exact content in the user's prod DB,
//  - treat a genuine user edit as NOT managed (never clobber edits).

describe('#1 — managed release-notes recognition (markdown-normalized)', () => {
  it('recognises the current changelog rendering as unedited/managed', () => {
    expect(isUneditedManagedReleaseNotes(currentReleaseNotesContent())).toBe(true)
  })

  it('recognises a prior-version rendering (changelog suffix) as unedited/managed', () => {
    const priorVersionBody = releaseNotesDocFromChangelog(CHANGELOG.slice(1))
    expect(isUneditedManagedReleaseNotes(priorVersionBody)).toBe(true)
  })

  it('the oldest-version rendering (single entry) is recognised as managed', () => {
    const oldestBody = releaseNotesDocFromChangelog(CHANGELOG.slice(CHANGELOG.length - 1))
    expect(isUneditedManagedReleaseNotes(oldestBody)).toBe(true)
  })

  it('produces one managed markdown projection per shipped version (changelog suffix)', () => {
    expect(managedReleaseNotesMarkdown().size).toBe(CHANGELOG.length)
  })

  // v0.2.7 #2: merely OPENING the doc in the editor rewrites its content via the
  // Tiptap schema (default textAlign/firstLineIndent = null on every node, an
  // auto-generated heading id, a trailing empty paragraph). That is NOT a user edit,
  // and the classifier must still recognise it as managed.
  it('recognises an editor-NORMALISED (opened, unedited) doc as managed', () => {
    const managed = currentReleaseNotesContent() as { content: Array<Record<string, unknown>> }
    const opened = {
      type: 'doc',
      content: managed.content.map((node) => {
        const n = node as { type?: string; attrs?: Record<string, unknown> }
        return {
          ...node,
          attrs: {
            ...(n.attrs ?? {}),
            textAlign: null,
            firstLineIndent: null,
            ...(n.type === 'heading' ? { id: 'auto-generated-id' } : {}),
          },
        }
      }),
    }
    ;(opened.content as unknown[]).push({
      type: 'paragraph',
      attrs: { textAlign: null, firstLineIndent: null },
    })
    expect(isUneditedManagedReleaseNotes(opened)).toBe(true)
  })

  it('still rejects a genuine edit even after editor normalisation', () => {
    const managed = currentReleaseNotesContent() as { content: Array<Record<string, unknown>> }
    const openedAndEdited = {
      type: 'doc',
      content: [
        ...managed.content.map((node) => ({
          ...node,
          attrs: { ...((node as { attrs?: object }).attrs ?? {}), textAlign: null },
        })),
        { type: 'paragraph', content: [{ type: 'text', text: 'genuinely mine' }] },
      ],
    }
    expect(isUneditedManagedReleaseNotes(openedAndEdited)).toBe(false)
  })

  // ── THE CRITICAL PROD-STATE ACCEPTANCE FIXTURE ──────────────────────────────
  //
  // Replicates the EXACT content sitting in the user's prod DB after v0.2.8 got
  // stuck: the v0.2.0-era body (CHANGELOG.slice(v0.2.0 index)), round-tripped
  // through the OLD buggy disk-sync + editor so the H1 accumulated snowballed
  // id-comments IN ITS TEXT (the observed prod evidence), plus editor artifacts
  // (null attrs, trailing empty paragraph, heading ids). If this does NOT classify
  // as UNEDITED, v0.2.9 fails live exactly like the last three releases.
  it('classifies the ACTUAL PROD DOC STATE (snowballed comments + editor artifacts) as UNEDITED', () => {
    const prod = synthesizeProdReleaseNotesDoc()
    expect(isUneditedManagedReleaseNotes(prod)).toBe(true)
  })

  it('a genuine edit ON TOP OF the prod snowballed state is still rejected', () => {
    const prod = synthesizeProdReleaseNotesDoc() as { content: unknown[] }
    // insert a real user paragraph before the trailing empty one
    prod.content.splice(prod.content.length - 1, 0, {
      type: 'paragraph',
      content: [{ type: 'text', text: 'a note the user actually typed' }],
    })
    expect(isUneditedManagedReleaseNotes(prod)).toBe(false)
  })

  // v0.2.9 #4 — BOOT-RACE SANITY. At container boot the reverse-sync watcher
  // re-imports the release-notes `.md` via markdownToJson BEFORE the refresh runs
  // (the exact race that stuck v0.2.8). With markdown-normalized detection that
  // import is benign: the imported content is markdown-stable, so it still
  // classifies as unedited. This test drives the FULL watcher round trip:
  // pristine → serialize (disk write) → markdownToJson (watcher import) → classify.
  it('a WATCHER-RE-IMPORTED doc (parse of on-disk markdown) still classifies as unedited', () => {
    for (const slice of [CHANGELOG, CHANGELOG.slice(1), CHANGELOG.slice(CHANGELOG.length - 1)]) {
      const pristine = releaseNotesDocFromChangelog(slice)
      const onDisk = serializeMarkdown(pristine) // what the mirror writes
      const reimported = markdownToJson(onDisk) // what the watcher parses back
      expect(isUneditedManagedReleaseNotes(reimported)).toBe(true)
      // And a SECOND round trip (disk↔DB↔disk) is still stable + unedited.
      const reimported2 = markdownToJson(serializeMarkdown(reimported))
      expect(isUneditedManagedReleaseNotes(reimported2)).toBe(true)
    }
  })

  it('normalizedReleaseNotesMarkdown strips all id comments and trailing whitespace', () => {
    const md = normalizedReleaseNotesMarkdown({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, id: 'release-notes' },
          content: [{ type: 'text', text: 'Release notes ' }],
        },
      ],
    })
    expect(md).not.toContain('<!--')
    expect(md).toBe('# Release notes')
  })
})

/**
 * Build a faithful replica of the prod release-notes doc: the v0.2.0-era pristine
 * body with editor artifacts baked in and the snowballed H1 id-comments injected
 * into the heading TEXT + attrs.id, exactly per the prod evidence:
 *   # Release notes <!-- id:release-notes --> <!-- id:release-notes-idrelease-notes -->
 *                   <!-- id:release-notes-idrelease-notes-idrelease-notes-idrelease-notes -->
 */
function synthesizeProdReleaseNotesDoc(): {
  type: string
  content: Array<Record<string, unknown>>
} {
  // v0.2.0 is index 10 in the newest-first CHANGELOG; the doc that got stuck was
  // seeded around then. Use whatever index v0.2.0 actually is (robust to reorders).
  const v020Index = CHANGELOG.findIndex((e) => e.version === '0.2.0')
  const base = releaseNotesDocFromChangelog(CHANGELOG.slice(v020Index >= 0 ? v020Index : 0)) as {
    type: string
    content: Array<Record<string, unknown>>
  }
  let headingCounter = 0
  const content = base.content.map((node) => {
    const n = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }
    const attrs: Record<string, unknown> = {
      ...(n.attrs ?? {}),
      textAlign: null,
      firstLineIndent: null,
    }
    if (n.type === 'heading' && (n.attrs?.level ?? 0) === 1) {
      // The H1 with the exact prod snowball baked into its rendered text + id.
      attrs.id = 'release-notes-idrelease-notes-idrelease-notes-idrelease-notes'
      return {
        type: 'heading',
        attrs,
        content: [
          {
            type: 'text',
            text: 'Release notes <!-- id:release-notes --> <!-- id:release-notes-idrelease-notes -->',
          },
        ],
      }
    }
    if (n.type === 'heading') {
      // realistic editor slug (dots stripped by slugify) so the id comment strips.
      headingCounter += 1
      attrs.id = `heading-${headingCounter}`
    }
    return { ...n, attrs }
  })
  // editor's mandatory trailing empty paragraph
  content.push({ type: 'paragraph', attrs: { textAlign: null, firstLineIndent: null } })
  return { type: 'doc', content }
}
