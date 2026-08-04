import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { mimeForName, scanLegacyAssets } from '@/lib/uploads/legacy-import'

// v0.2.15: the scan half of the legacy asset import. Hermetic - a real temp dir,
// no database. The DB half is one upsertAsset call, already covered.
//
// What matters here is the FILTERING. This code turns filenames on disk into
// database rows, so anything it accepts becomes a row; a loose scan would import
// junk, and a strict-but-wrong one would silently leave production assets behind.

const DOC_A = '19240043-0392-4799-8b41-8a3eaa8d951f'
const DOC_B = '25bddaa2-b67c-4bab-9b0a-ec87f0af54fb'
const ASSET_A = '5959b58a-c9a2-496a-8bb5-04c4bbbb5a72.png'
const ASSET_B = 'c67d1549-f511-4a57-b214-bf5e0844dc71.jpg'

const roots: string[] = []

async function makeTree(files: Array<[docDir: string, filename: string]>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'parchment-legacy-'))
  roots.push(root)
  for (const [docDir, filename] of files) {
    const dir = join(root, '.assets', docDir)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, filename), 'x')
  }
  return root
}

afterAll(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })))
})

describe('scanLegacyAssets', () => {
  it('returns nothing when there is no legacy tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'parchment-legacy-'))
    roots.push(root)
    expect(await scanLegacyAssets(root)).toEqual([])
  })

  it('finds one asset, the production case', async () => {
    const root = await makeTree([[DOC_A, ASSET_A]])
    const found = await scanLegacyAssets(root)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ docId: DOC_A, filename: ASSET_A, byteSize: 1 })
  })

  it('finds assets across several documents', async () => {
    const root = await makeTree([
      [DOC_A, ASSET_A],
      [DOC_B, ASSET_B],
    ])
    const found = await scanLegacyAssets(root)
    expect(found.map((f) => f.docId).sort()).toEqual([DOC_A, DOC_B].sort())
  })

  it('ignores a directory that is not a uuid', async () => {
    // Anything accepted here becomes a row keyed by a foreign key to documents.id.
    const root = await makeTree([
      ['not-a-uuid', ASSET_A],
      [DOC_A, ASSET_A],
    ])
    const found = await scanLegacyAssets(root)
    expect(found).toHaveLength(1)
    expect(found[0]?.docId).toBe(DOC_A)
  })

  it('ignores files that are not minted asset names', async () => {
    const root = await makeTree([
      [DOC_A, ASSET_A],
      [DOC_A, 'holiday-photo.png'],
      [DOC_A, '.DS_Store'],
      [DOC_A, 'notes.txt'],
    ])
    const found = await scanLegacyAssets(root)
    expect(found.map((f) => f.filename)).toEqual([ASSET_A])
  })

  it('ignores a nested directory inside a doc dir', async () => {
    const root = await makeTree([[DOC_A, ASSET_A]])
    await mkdir(join(root, '.assets', DOC_A, 'subdir'), { recursive: true })
    const found = await scanLegacyAssets(root)
    expect(found).toHaveLength(1)
  })

  it('reports the real byte size', async () => {
    const root = await mkdtemp(join(tmpdir(), 'parchment-legacy-'))
    roots.push(root)
    const dir = join(root, '.assets', DOC_A)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, ASSET_A), Buffer.alloc(1234, 7))
    const found = await scanLegacyAssets(root)
    expect(found[0]?.byteSize).toBe(1234)
  })
})

describe('mimeForName', () => {
  it('maps the allowed upload types', () => {
    expect(mimeForName('x.png')).toBe('image/png')
    expect(mimeForName('x.jpg')).toBe('image/jpeg')
    expect(mimeForName('x.jpeg')).toBe('image/jpeg')
    expect(mimeForName('x.gif')).toBe('image/gif')
    expect(mimeForName('x.webp')).toBe('image/webp')
    expect(mimeForName('x.svg')).toBe('image/svg+xml')
    expect(mimeForName('x.pdf')).toBe('application/pdf')
  })

  it('is case-insensitive on the extension', () => {
    expect(mimeForName('x.PNG')).toBe('image/png')
  })

  it('falls back to octet-stream rather than guessing', () => {
    expect(mimeForName('x.bin')).toBe('application/octet-stream')
    expect(mimeForName('noextension')).toBe('application/octet-stream')
  })
})
