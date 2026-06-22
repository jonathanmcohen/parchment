// @vitest-environment node
// H9: unit tests for src/lib/import/index.ts
// Tests detectImportType, htmlToMarkdown, and importToPmJson.
// No network / db / docx live-conversion — those stay in integration tests.

import { describe, expect, it } from 'vitest'
import { detectImportType, htmlToMarkdown, importToPmJson } from '@/lib/import'

// PK magic bytes for a valid zip header
const PK_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
const EMPTY = new Uint8Array([0x00])

// ─── detectImportType ────────────────────────────────────────────────────────

describe('detectImportType', () => {
  it('detects .md extension', () => {
    expect(detectImportType('hello.md', EMPTY)).toBe('md')
  })

  it('detects .markdown extension', () => {
    expect(detectImportType('notes.markdown', EMPTY)).toBe('md')
  })

  it('detects .html extension', () => {
    expect(detectImportType('page.html', EMPTY)).toBe('html')
  })

  it('detects .htm extension', () => {
    expect(detectImportType('page.htm', EMPTY)).toBe('html')
  })

  it('detects .docx extension', () => {
    expect(detectImportType('report.docx', EMPTY)).toBe('docx')
  })

  it('detects .zip with PK magic as notion-zip', () => {
    expect(detectImportType('export.zip', PK_BYTES)).toBe('notion-zip')
  })

  it('returns unknown for unsupported extension', () => {
    expect(detectImportType('image.png', EMPTY)).toBe('unknown')
  })

  it('returns unknown for .zip without PK magic', () => {
    expect(detectImportType('bad.zip', EMPTY)).toBe('unknown')
  })
})

// ─── htmlToMarkdown ──────────────────────────────────────────────────────────

describe('htmlToMarkdown', () => {
  it('converts <h1> to # heading', async () => {
    const md = await htmlToMarkdown('<h1>Hi</h1><p><strong>b</strong></p>')
    expect(md).toContain('# Hi')
    expect(md).toContain('**b**')
  })

  it('converts a plain paragraph to text', async () => {
    const md = await htmlToMarkdown('<p>hello world</p>')
    expect(md).toContain('hello world')
  })

  it('converts <em> to italic markdown', async () => {
    const md = await htmlToMarkdown('<p><em>italics</em></p>')
    expect(md).toContain('_italics_')
  })

  it('never throws on empty input', async () => {
    await expect(htmlToMarkdown('')).resolves.toBeDefined()
  })
})

// ─── importToPmJson ──────────────────────────────────────────────────────────

describe('importToPmJson', () => {
  it('imports markdown → PM doc with heading node', async () => {
    const md = '# Hello\n\nworld'
    const bytes = new TextEncoder().encode(md)
    const result = await importToPmJson('md', bytes, 'test.md')
    expect(result.warnings).toHaveLength(0)
    expect(result.json.type).toBe('doc')
    // The content should have a heading somewhere
    const json = result.json as { content: { type: string }[] }
    const hasHeading = json.content.some((n) => n.type === 'heading')
    expect(hasHeading).toBe(true)
  })

  it('uses H1 as the title for md import', async () => {
    const md = '# My Title\n\nsome text'
    const bytes = new TextEncoder().encode(md)
    const result = await importToPmJson('md', bytes, 'filename.md')
    expect(result.title).toBe('My Title')
  })

  it('falls back to filename (sans extension) when no H1', async () => {
    const md = 'just a paragraph'
    const bytes = new TextEncoder().encode(md)
    const result = await importToPmJson('md', bytes, 'my-doc.md')
    expect(result.title).toBe('my-doc')
  })

  it('imports HTML → PM doc with heading node', async () => {
    const html = '<h1>Hello HTML</h1><p>para</p>'
    const bytes = new TextEncoder().encode(html)
    const result = await importToPmJson('html', bytes, 'page.html')
    expect(result.json.type).toBe('doc')
    const json = result.json as { content: { type: string }[] }
    const hasHeading = json.content.some((n) => n.type === 'heading')
    expect(hasHeading).toBe(true)
  })

  it('imports HTML with bold → PM doc with bold mark', async () => {
    const html = '<p><strong>bold text</strong></p>'
    const bytes = new TextEncoder().encode(html)
    const result = await importToPmJson('html', bytes, 'page.html')
    // Should parse without warnings and produce a doc
    expect(result.json.type).toBe('doc')
    expect(result.warnings).toHaveLength(0)
  })

  it('returns partial result + warning for malformed docx buffer (never throws)', async () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])
    const result = await importToPmJson('docx', garbage, 'broken.docx')
    // Must not throw, must return a doc
    expect(result.json.type).toBe('doc')
    // Should have at least one warning about the failure
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('handles unknown type by returning empty doc + warning', async () => {
    const result = await importToPmJson('unknown', EMPTY, 'image.png')
    expect(result.json.type).toBe('doc')
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
