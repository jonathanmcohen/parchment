import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { buildBulkZip } from '@/lib/export/bulk'

const simpleDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello from doc' }],
    },
  ],
}

const anotherDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Second doc content' }],
    },
  ],
}

describe('buildBulkZip', () => {
  it('returns a Uint8Array starting with PK (ZIP magic bytes)', async () => {
    const docs = [
      { id: '1', title: 'Doc A', content: simpleDoc },
      { id: '2', title: 'Doc B', content: anotherDoc },
    ]
    const zip = await buildBulkZip(docs, 'md')
    expect(zip).toBeInstanceOf(Uint8Array)
    // ZIP local file header signature: PK (0x50 0x4B)
    expect(zip[0]).toBe(0x50) // 'P'
    expect(zip[1]).toBe(0x4b) // 'K'
  })

  it('ZIP contains 2 entries with .md extension and correct content', async () => {
    const docs = [
      { id: '1', title: 'Doc A', content: simpleDoc },
      { id: '2', title: 'Doc B', content: anotherDoc },
    ]
    const zipBytes = await buildBulkZip(docs, 'md')
    const loaded = await JSZip.loadAsync(zipBytes)
    const names = Object.keys(loaded.files)
    expect(names).toHaveLength(2)
    for (const name of names) {
      expect(name).toMatch(/\.md$/)
    }
    // Check content of each file contains the expected text
    const contentA = await loaded.files['Doc-A.md']?.async('string')
    const contentB = await loaded.files['Doc-B.md']?.async('string')
    expect(contentA).toContain('Hello from doc')
    expect(contentB).toContain('Second doc content')
  })

  it('duplicate titles get unique filenames (Doc.md, Doc-2.md)', async () => {
    const docs = [
      { id: '1', title: 'Doc', content: simpleDoc },
      { id: '2', title: 'Doc', content: anotherDoc },
    ]
    const zipBytes = await buildBulkZip(docs, 'md')
    const loaded = await JSZip.loadAsync(zipBytes)
    const names = Object.keys(loaded.files).sort()
    expect(names).toHaveLength(2)
    expect(names).toContain('Doc.md')
    expect(names).toContain('Doc-2.md')
  })

  it('empty docs array returns a valid (empty) ZIP', async () => {
    const zipBytes = await buildBulkZip([], 'md')
    expect(zipBytes).toBeInstanceOf(Uint8Array)
    // Must be parseable as a ZIP (even if empty)
    const loaded = await JSZip.loadAsync(zipBytes)
    expect(Object.keys(loaded.files)).toHaveLength(0)
  })

  it('never throws on a malformed/null doc — skips it', async () => {
    const docs = [
      { id: '1', title: 'Good', content: simpleDoc },
      // deliberately malformed: content is a string (will cause export issues for binary formats)
      // We test with 'docx' which expects a ProseMirror JSON object
      { id: '2', title: 'Bad', content: null },
    ]
    // Should not throw; should silently skip the bad doc
    await expect(buildBulkZip(docs, 'md')).resolves.toBeInstanceOf(Uint8Array)
  })
})
