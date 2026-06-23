// @vitest-environment node

import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { docToDocx } from '@/lib/export/docx'

const sampleDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'My Heading' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello, paragraph text here.' }] },
  ],
}

describe('docToDocx', () => {
  it('returns a non-empty Uint8Array', async () => {
    const result = await docToDocx(sampleDoc, 'Test Doc')
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBeGreaterThan(0)
  })

  it('first bytes are ZIP magic PK\\x03\\x04 (docx is a zip)', async () => {
    const result = await docToDocx(sampleDoc, 'Test Doc')
    // ZIP local file header signature: 50 4B 03 04
    expect(result[0]).toBe(0x50) // P
    expect(result[1]).toBe(0x4b) // K
    expect(result[2]).toBe(0x03)
    expect(result[3]).toBe(0x04)
  })

  it('contains word/document.xml when unzipped via jszip', async () => {
    const result = await docToDocx(sampleDoc, 'Test Doc')
    const zip = await JSZip.loadAsync(result)
    const docXml = zip.file('word/document.xml')
    expect(docXml).not.toBeNull()
  })

  it('word/document.xml contains heading and paragraph text', async () => {
    const result = await docToDocx(sampleDoc, 'Test Doc')
    const zip = await JSZip.loadAsync(result)
    const docXml = zip.file('word/document.xml')
    const content = await docXml?.async('string')
    expect(content).toContain('My Heading')
    expect(content).toContain('Hello, paragraph text here.')
  })

  it('never throws on malformed / null input', async () => {
    await expect(docToDocx(null, 'Title')).resolves.toBeInstanceOf(Uint8Array)
    await expect(docToDocx(undefined, 'Title')).resolves.toBeInstanceOf(Uint8Array)
    await expect(docToDocx({}, '')).resolves.toBeInstanceOf(Uint8Array)
  })
})
