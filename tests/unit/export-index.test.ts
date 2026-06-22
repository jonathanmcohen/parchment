import { describe, expect, it } from 'vitest'
import { exportDoc, exportFilename, parseExportFormat } from '@/lib/export'

const simpleDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello' }],
    },
  ],
}

describe('exportDoc', () => {
  it('md → text/markdown contentType and md ext', () => {
    const result = exportDoc(simpleDoc, 'My Doc', 'md')
    expect(result.contentType).toBe('text/markdown; charset=utf-8')
    expect(result.ext).toBe('md')
    expect(result.body).toContain('Hello')
  })

  it('txt → text/plain contentType and txt ext', () => {
    const result = exportDoc(simpleDoc, 'My Doc', 'txt')
    expect(result.contentType).toBe('text/plain; charset=utf-8')
    expect(result.ext).toBe('txt')
    expect(result.body).toContain('Hello')
  })

  it('html → text/html contentType and html ext', () => {
    const result = exportDoc(simpleDoc, 'My Doc', 'html')
    expect(result.contentType).toBe('text/html; charset=utf-8')
    expect(result.ext).toBe('html')
    expect(result.body).toContain('Hello')
  })
})

describe('parseExportFormat', () => {
  it('accepts known formats', () => {
    expect(parseExportFormat('md')).toBe('md')
    expect(parseExportFormat('txt')).toBe('txt')
    expect(parseExportFormat('html')).toBe('html')
  })

  it('rejects unknown formats', () => {
    expect(parseExportFormat('pdf')).toBeNull()
    expect(parseExportFormat('')).toBeNull()
    expect(parseExportFormat(null)).toBeNull()
    expect(parseExportFormat(undefined)).toBeNull()
    expect(parseExportFormat(42)).toBeNull()
  })
})

describe('exportDoc with null-equivalent content', () => {
  // Mirrors the null-content guard in the export route:
  // doc.content ?? { type: 'doc', content: [] }
  const emptyDoc = { type: 'doc', content: [] }

  it('md export of empty doc returns empty string without throwing', () => {
    const result = exportDoc(emptyDoc, 'Empty', 'md')
    expect(result.body).toBe('')
    expect(result.ext).toBe('md')
  })

  it('txt export of empty doc returns empty string without throwing', () => {
    const result = exportDoc(emptyDoc, 'Empty', 'txt')
    expect(result.body).toBe('')
    expect(result.ext).toBe('txt')
  })

  it('html export of empty doc produces valid standalone html without throwing', () => {
    const result = exportDoc(emptyDoc, 'Empty', 'html')
    expect(result.body.toLowerCase()).toMatch(/^<!doctype html/)
    expect(result.ext).toBe('html')
  })
})

describe('exportFilename', () => {
  it('appends the extension', () => {
    expect(exportFilename('My Doc', 'md')).toBe('My-Doc.md')
  })

  it('strips unsafe characters', () => {
    const name = exportFilename('Hello <World> & Friends!', 'txt')
    expect(name).not.toContain('<')
    expect(name).not.toContain('>')
    expect(name).not.toContain('&')
    expect(name).toMatch(/\.txt$/)
  })

  it('handles an empty title → document.<ext>', () => {
    expect(exportFilename('', 'html')).toBe('document.html')
    expect(exportFilename('   ', 'md')).toBe('document.md')
  })

  it('collapses repeated spaces/dashes', () => {
    const name = exportFilename('My   Title  Here', 'md')
    expect(name).toBe('My-Title-Here.md')
  })
})
