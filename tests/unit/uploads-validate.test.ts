// @vitest-environment node
// J1-1: unit tests for src/lib/uploads/validate.ts — pure upload validator.
// Magic-byte sniffing (never trust file.type alone), allow-lists, size caps,
// SVG <script> rejection, double-extension normalization.

import { describe, expect, it } from 'vitest'
import { classifyUpload, MAX_FILE_BYTES, MAX_IMAGE_BYTES, sniffMagic } from '@/lib/uploads/validate'

// ── Magic-byte fixtures ──────────────────────────────────────────────────────
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const GIF87 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
const GIF89 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
// RIFF....WEBP
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const SVG_PLAIN = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
const SVG_SCRIPT = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
)
const SVG_ONLOAD = new TextEncoder().encode('<svg onload="alert(1)"></svg>')
const TXT = new TextEncoder().encode('just some text\n')

describe('sniffMagic', () => {
  it('recognizes png/jpeg/gif/webp/pdf by leading bytes', () => {
    expect(sniffMagic(PNG)).toBe('image/png')
    expect(sniffMagic(JPEG)).toBe('image/jpeg')
    expect(sniffMagic(GIF87)).toBe('image/gif')
    expect(sniffMagic(GIF89)).toBe('image/gif')
    expect(sniffMagic(WEBP)).toBe('image/webp')
    expect(sniffMagic(PDF)).toBe('application/pdf')
  })

  it('returns null for content with no recognized signature', () => {
    expect(sniffMagic(TXT)).toBeNull()
    expect(sniffMagic(new Uint8Array([0x00, 0x01]))).toBeNull()
  })
})

describe('classifyUpload', () => {
  it('accepts a valid png as kind=image', () => {
    const r = classifyUpload({ name: 'a.png', type: 'image/png', size: 10 }, PNG)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.kind).toBe('image')
      expect(r.ext).toBe('png')
      expect(r.contentType).toBe('image/png')
    }
  })

  it('accepts a valid jpeg', () => {
    const r = classifyUpload({ name: 'photo.jpg', type: 'image/jpeg', size: 10 }, JPEG)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.kind).toBe('image')
  })

  it('accepts a valid pdf as kind=file', () => {
    const r = classifyUpload({ name: 'doc.pdf', type: 'application/pdf', size: 10 }, PDF)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.kind).toBe('file')
      expect(r.ext).toBe('pdf')
    }
  })

  it('accepts text/plain and text/csv (sniff-exempt text types) by declared type', () => {
    const t = classifyUpload({ name: 'notes.txt', type: 'text/plain', size: 10 }, TXT)
    expect(t.ok).toBe(true)
    if (t.ok) expect(t.kind).toBe('file')
    const c = classifyUpload({ name: 'data.csv', type: 'text/csv', size: 10 }, TXT)
    expect(c.ok).toBe(true)
  })

  it('rejects an SVG containing <script> (XSS payload)', () => {
    const r = classifyUpload({ name: 'x.svg', type: 'image/svg+xml', size: 10 }, SVG_SCRIPT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('unsafe_svg')
  })

  it('rejects an SVG with an on* event handler attribute', () => {
    const r = classifyUpload({ name: 'x.svg', type: 'image/svg+xml', size: 10 }, SVG_ONLOAD)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('unsafe_svg')
  })

  it('accepts a clean SVG', () => {
    const r = classifyUpload({ name: 'logo.svg', type: 'image/svg+xml', size: 10 }, SVG_PLAIN)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.kind).toBe('image')
      expect(r.ext).toBe('svg')
    }
  })

  it('rejects magic-bytes that do not match the declared image type (spoof)', () => {
    // declared png, but the bytes are a PDF
    const r = classifyUpload({ name: 'fake.png', type: 'image/png', size: 10 }, PDF)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('content_mismatch')
  })

  it('rejects a php payload renamed with a double extension (x.php.png) whose bytes are not an image', () => {
    const r = classifyUpload(
      { name: 'x.php.png', type: 'image/png', size: 10 },
      new TextEncoder().encode('<?php system($_GET[0]); ?>'),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('content_mismatch')
  })

  it('rejects an oversize image (> MAX_IMAGE_BYTES)', () => {
    const r = classifyUpload({ name: 'big.png', type: 'image/png', size: MAX_IMAGE_BYTES + 1 }, PNG)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('too_large')
  })

  it('rejects an oversize file (> MAX_FILE_BYTES)', () => {
    const r = classifyUpload(
      { name: 'big.pdf', type: 'application/pdf', size: MAX_FILE_BYTES + 1 },
      PDF,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('too_large')
  })

  it('rejects a disallowed mime type', () => {
    const r = classifyUpload(
      { name: 'a.exe', type: 'application/x-msdownload', size: 10 },
      new Uint8Array([0x4d, 0x5a]),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('unsupported_type')
  })

  it('derives the extension from the sniffed content type, ignoring a spoofed name', () => {
    // bytes are a real PNG but the name claims .pdf and type claims pdf →
    // content_mismatch (pdf magic expected, png seen)
    const r = classifyUpload({ name: 'evil.pdf', type: 'application/pdf', size: 10 }, PNG)
    expect(r.ok).toBe(false)
  })
})
