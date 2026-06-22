import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT_VERSION,
  type BackupDocInput,
  buildWorkspaceBackup,
  parseWorkspaceBackup,
  safeEntryName,
} from '@/lib/backup/archive'

const CREATED_AT = '2026-06-22T00:00:00.000Z'

const simpleDoc: BackupDocInput = {
  id: 'doc-1',
  title: 'First Doc',
  folderId: null,
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
  },
}

// A doc whose PM JSON nests a diagram + a math node — exactly the content that
// markdown export would lose. The lossless backup must round-trip it verbatim.
const richDoc: BackupDocInput = {
  id: 'doc-2',
  title: 'Diagrams & Math',
  folderId: 'folder-abc',
  content: {
    type: 'doc',
    content: [
      {
        type: 'excalidraw',
        attrs: {
          elements: [{ id: 'el1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50 }],
          appState: { viewBackgroundColor: '#ffffff' },
        },
      },
      {
        type: 'math_block',
        attrs: { latex: '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt\\pi}{2}' },
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'cite ' },
          { type: 'citation', attrs: { key: 'knuth1997', locator: 'p. 42' } },
        ],
      },
    ],
  },
}

describe('I4 — buildWorkspaceBackup / parseWorkspaceBackup round-trip', () => {
  it('preserves doc count, titles, folderIds, and raw PM content byte-for-byte', async () => {
    const docs = [simpleDoc, richDoc]
    const bytes = await buildWorkspaceBackup(docs, CREATED_AT)
    const { manifest, entries, warnings } = await parseWorkspaceBackup(bytes)

    expect(warnings).toHaveLength(0)
    expect(manifest.version).toBe(BACKUP_FORMAT_VERSION)
    expect(manifest.createdAt).toBe(CREATED_AT)
    expect(manifest.docCount).toBe(2)
    expect(entries).toHaveLength(2)

    const byId = new Map(entries.map((e) => [e.meta.id, e]))
    expect(byId.get('doc-1')?.meta.title).toBe('First Doc')
    expect(byId.get('doc-2')?.meta.title).toBe('Diagrams & Math')
    expect(byId.get('doc-1')?.meta.folderId).toBeNull()
    expect(byId.get('doc-2')?.meta.folderId).toBe('folder-abc')

    // Byte-for-byte: the parsed content must deep-equal the original PM JSON.
    expect(byId.get('doc-1')?.content).toEqual(simpleDoc.content)
    expect(byId.get('doc-2')?.content).toEqual(richDoc.content)
  })

  it('round-trips a nested diagram/math/citation doc losslessly (deep-equal)', async () => {
    const bytes = await buildWorkspaceBackup([richDoc], CREATED_AT)
    const { entries } = await parseWorkspaceBackup(bytes)
    expect(entries).toHaveLength(1)
    // The exact, fully-nested structure survives — nothing flattened to markdown.
    expect(entries[0]?.content).toEqual(richDoc.content)
    // And it really is the deep structure, not a string.
    const content = entries[0]?.content as { content: { type: string }[] }
    expect(content.content[0]?.type).toBe('excalidraw')
    expect(content.content[1]?.type).toBe('math_block')
  })

  it('stores a lossless docs/<id>.json and a human-readable .md per doc', async () => {
    const bytes = await buildWorkspaceBackup([simpleDoc], CREATED_AT)
    const zip = await JSZip.loadAsync(bytes)
    const names = Object.keys(zip.files)
    expect(names).toContain('manifest.json')
    expect(names).toContain('docs/doc-1.json')
    // best-effort markdown copy exists and is human-readable
    const mdName = names.find((n) => n.startsWith('docs/') && n.endsWith('.md'))
    expect(mdName).toBeDefined()
    const md = await zip.files[mdName as string]?.async('string')
    expect(md).toContain('Hello world')
  })
})

describe('I4 — parseWorkspaceBackup validation + guards', () => {
  it('rejects a zip with no manifest.json', async () => {
    const zip = new JSZip()
    zip.file('random.txt', 'not a backup')
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    await expect(parseWorkspaceBackup(bytes)).rejects.toThrow(/manifest\.json is missing/)
  })

  it('rejects bytes that are not a ZIP archive', async () => {
    const notZip = new TextEncoder().encode('plain text, definitely not a zip')
    await expect(parseWorkspaceBackup(notZip)).rejects.toThrow(/not a ZIP archive/)
  })

  it('skips an oversized entry (H9 guard) with a warning, never throws', async () => {
    // Build a zip by hand: a valid manifest pointing at an entry whose
    // uncompressed size exceeds MAX_UNCOMPRESSED_ENTRY (50 MB). Repeated text
    // compresses to a tiny zip, so the test stays fast while the declared
    // uncompressed size trips the per-entry guard.
    const big = 'A'.repeat(51 * 1024 * 1024) // 51 MB uncompressed
    const manifest = {
      version: BACKUP_FORMAT_VERSION,
      createdAt: CREATED_AT,
      docCount: 1,
      docs: [{ id: 'huge', title: 'Huge', folderId: null, file: 'docs/huge.json' }],
    }
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(manifest))
    zip.file('docs/huge.json', big)
    const bytes = await zip.generateAsync({ type: 'uint8array' })

    const { entries, warnings } = await parseWorkspaceBackup(bytes)
    expect(entries).toHaveLength(0)
    expect(warnings.some((w) => /oversized/i.test(w))).toBe(true)
  })

  it('pushes a warning and skips a manifest doc whose entry is missing', async () => {
    const manifest = {
      version: BACKUP_FORMAT_VERSION,
      createdAt: CREATED_AT,
      docCount: 1,
      docs: [{ id: 'ghost', title: 'Ghost', folderId: null, file: 'docs/ghost.json' }],
    }
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(manifest))
    // intentionally do NOT add docs/ghost.json
    const bytes = await zip.generateAsync({ type: 'uint8array' })

    const { entries, warnings } = await parseWorkspaceBackup(bytes)
    expect(entries).toHaveLength(0)
    expect(warnings.some((w) => /Missing backup entry/i.test(w))).toBe(true)
  })

  it('safeEntryName rejects path traversal and absolute paths', () => {
    expect(safeEntryName('../escape.json')).toBeNull()
    expect(safeEntryName('docs/../../etc/passwd')).toBeNull()
    expect(safeEntryName('/abs/path.json')).toBeNull()
    expect(safeEntryName('docs/doc-1.json')).toBe('docs/doc-1.json')
  })
})
