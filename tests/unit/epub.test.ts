// @vitest-environment node

import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { docToEpub } from '@/lib/export/epub'

const sampleDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'EPUB Heading' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello from the epub chapter.' }] },
  ],
}

describe('docToEpub', () => {
  it('returns a non-empty Uint8Array starting with PK (ZIP magic)', async () => {
    const result = await docToEpub(sampleDoc, 'Test EPUB')
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toBe(0x50) // P
    expect(result[1]).toBe(0x4b) // K
  })

  it('contains mimetype === application/epub+zip when unzipped', async () => {
    const result = await docToEpub(sampleDoc, 'Test EPUB')
    const zip = await JSZip.loadAsync(result)
    const mimetypeFile = zip.file('mimetype')
    expect(mimetypeFile).not.toBeNull()
    const mimetypeContent = await mimetypeFile?.async('string')
    expect(mimetypeContent).toBe('application/epub+zip')
  })

  it('contains META-INF/container.xml', async () => {
    const result = await docToEpub(sampleDoc, 'Test EPUB')
    const zip = await JSZip.loadAsync(result)
    const containerFile = zip.file('META-INF/container.xml')
    expect(containerFile).not.toBeNull()
    const content = await containerFile?.async('string')
    expect(content).toContain('content.opf')
  })

  it('contains OEBPS/content.opf', async () => {
    const result = await docToEpub(sampleDoc, 'Test EPUB')
    const zip = await JSZip.loadAsync(result)
    const opfFile = zip.file('OEBPS/content.opf')
    expect(opfFile).not.toBeNull()
    const content = await opfFile?.async('string')
    expect(content).toContain('Test EPUB')
    expect(content).toContain('chapter.xhtml')
  })

  it('chapter.xhtml contains doc text', async () => {
    const result = await docToEpub(sampleDoc, 'Test EPUB')
    const zip = await JSZip.loadAsync(result)
    const chapterFile = zip.file('OEBPS/chapter.xhtml')
    expect(chapterFile).not.toBeNull()
    const content = await chapterFile?.async('string')
    expect(content).toContain('Hello from the epub chapter.')
  })

  it('never throws on malformed / null input', async () => {
    await expect(docToEpub(null, 'Title')).resolves.toBeInstanceOf(Uint8Array)
    await expect(docToEpub(undefined, 'Title')).resolves.toBeInstanceOf(Uint8Array)
    await expect(docToEpub({}, '')).resolves.toBeInstanceOf(Uint8Array)
  })
})
